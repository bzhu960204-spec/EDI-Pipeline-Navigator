package com.dsv.edinav.workflow;

import com.dsv.edinav.common.ApiException;
import com.dsv.edinav.artifact.ArtifactRepository;
import com.dsv.edinav.security.CurrentUserService;
import com.dsv.edinav.workflow.dto.BusinessRoleDto;
import com.dsv.edinav.workflow.dto.CoFireGroupRequest;
import com.dsv.edinav.workflow.dto.CreateStepRequest;
import com.dsv.edinav.workflow.dto.CreateTransitionGroupRequest;
import com.dsv.edinav.workflow.dto.CreateTransitionRequest;
import com.dsv.edinav.workflow.dto.ReviewRequest;
import com.dsv.edinav.workflow.dto.StepReviewDto;
import com.dsv.edinav.workflow.dto.TransitionDto;
import com.dsv.edinav.workflow.dto.UpdateStepRequest;
import com.dsv.edinav.workflow.dto.UpdateTransitionGroupRequest;
import com.dsv.edinav.workflow.dto.WorkflowDto;
import com.dsv.edinav.workflow.dto.WorkflowRequest;
import com.dsv.edinav.workflow.dto.WorkflowStepDto;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class WorkflowService {

    private final WorkflowRepository workflowRepository;
    private final WorkflowStepRepository stepRepository;
    private final WorkflowTransitionRepository transitionRepository;
    private final TransitionGroupRepository transitionGroupRepository;
    private final TransitionCoFireGroupRepository coFireGroupRepository;
    private final BusinessRoleRepository roleRepository;
    private final WorkflowPhaseRepository phaseRepository;
    private final WorkflowFolderRepository folderRepository;
    private final ArtifactRepository artifactRepository;
    private final StepReviewRepository reviewRepository;
    private final StepFlagRepository flagRepository;
    private final CurrentUserService currentUser;

    /** Personal importance levels a step may be flagged with; anything else is rejected. */
    private static final Set<String> ALLOWED_FLAG_LEVELS = Set.of("critical", "important", "review-later");

    public WorkflowService(WorkflowRepository workflowRepository,
                           WorkflowStepRepository stepRepository,
                           WorkflowTransitionRepository transitionRepository,
                           TransitionGroupRepository transitionGroupRepository,
                           TransitionCoFireGroupRepository coFireGroupRepository,
                           BusinessRoleRepository roleRepository,
                           WorkflowPhaseRepository phaseRepository,
                           WorkflowFolderRepository folderRepository,
                           ArtifactRepository artifactRepository,
                           StepReviewRepository reviewRepository,
                           StepFlagRepository flagRepository,
                           CurrentUserService currentUser) {
        this.workflowRepository = workflowRepository;
        this.stepRepository = stepRepository;
        this.transitionRepository = transitionRepository;
        this.transitionGroupRepository = transitionGroupRepository;
        this.coFireGroupRepository = coFireGroupRepository;
        this.roleRepository = roleRepository;
        this.phaseRepository = phaseRepository;
        this.folderRepository = folderRepository;
        this.artifactRepository = artifactRepository;
        this.reviewRepository = reviewRepository;
        this.flagRepository = flagRepository;
        this.currentUser = currentUser;
    }

    // ---------------- Workflows (containers) ----------------

    @Transactional(readOnly = true)
    public List<WorkflowDto> getWorkflows() {
        return workflowRepository.findByOwnerIdAndIsCurrentTrueOrderByOrderIndexAsc(currentUser.requireUserId()).stream()
                .map(this::toWorkflowDto).toList();
    }

    @Transactional(readOnly = true)
    public WorkflowDto getWorkflow(Long id) {
        return toWorkflowDto(requireWorkflow(id));
    }

    /** Lists every version of the logical workflow the given id belongs to, oldest first. */
    @Transactional(readOnly = true)
    public List<WorkflowDto> getVersions(Long id) {
        Workflow workflow = requireWorkflow(id);
        return workflowRepository.findByGroupIdOrderByVersionAsc(workflow.getGroupId()).stream()
                .map(this::toWorkflowDto).toList();
    }

    @Transactional
    public WorkflowDto createWorkflow(WorkflowRequest request) {
        Long ownerId = currentUser.requireUserId();
        if (workflowRepository.existsByNameIgnoreCaseAndOwnerId(request.name().trim(), ownerId)) {
            throw new ApiException(HttpStatus.CONFLICT, "Workflow name already exists");
        }
        Workflow workflow = new Workflow();
        workflow.setOwnerId(ownerId);
        workflow.setName(request.name().trim());
        workflow.setDescription(request.description());
        workflow.setStatus(request.status() == null ? WorkflowStatus.DRAFT : parseStatus(request.status()));
        workflow.setOrderIndex(workflowRepository.nextOrderIndex());
        workflow.setFolderId(resolveFolderId(request.folderId()));
        workflow.setTags(cleanTags(request.tags()));
        return toWorkflowDto(saveAsNewGroup(workflow));
    }

    /** Saves a brand-new workflow as version 1 of its own group (groupId = the row's own id). */
    Workflow saveAsNewGroup(Workflow workflow) {
        workflow.setVersion(1);
        workflow.setCurrent(true);
        Workflow saved = workflowRepository.save(workflow);
        saved.setGroupId(saved.getId());
        return workflowRepository.save(saved);
    }

    /** Updates only the (optional) label/remark of a single version. */
    @Transactional
    public WorkflowDto updateVersionLabel(Long id, String label) {
        Workflow workflow = requireWorkflow(id);
        String trimmed = label == null ? null : label.trim();
        workflow.setVersionLabel(trimmed == null || trimmed.isEmpty() ? null : trimmed);
        return toWorkflowDto(workflowRepository.save(workflow));
    }

    /** Makes the given version the current one for its group, unsetting the flag on its siblings. */
    @Transactional
    public WorkflowDto setCurrent(Long id) {
        Workflow target = requireWorkflow(id);
        workflowRepository.findByGroupIdOrderByVersionAsc(target.getGroupId()).forEach(w -> {
            if (w.isCurrent() && !w.getId().equals(id)) {
                w.setCurrent(false);
                workflowRepository.save(w);
            }
        });
        target.setCurrent(true);
        return toWorkflowDto(workflowRepository.save(target));
    }

    @Transactional
    public WorkflowDto updateWorkflow(Long id, WorkflowRequest request) {
        Workflow workflow = requireWorkflow(id);
        String name = request.name().trim();
        if (workflowRepository.existsByNameIgnoreCaseAndOwnerIdAndGroupIdNot(name, workflow.getOwnerId(), workflow.getGroupId())) {
            throw new ApiException(HttpStatus.CONFLICT, "Workflow name already exists");
        }
        workflow.setName(name);
        workflow.setDescription(request.description());
        if (request.status() != null) {
            workflow.setStatus(parseStatus(request.status()));
        }
        workflow.setFolderId(resolveFolderId(request.folderId()));
        workflow.setTags(cleanTags(request.tags()));
        return toWorkflowDto(workflowRepository.save(workflow));
    }

    @Transactional
    public void deleteWorkflow(Long id) {
        Workflow workflow = requireWorkflow(id);
        List<WorkflowStep> steps = stepRepository.findByWorkflowIdOrderByOrderIndexAsc(id);
        for (WorkflowStep step : steps) {
            long onStep = artifactRepository.countByCurrentStepId(step.getId());
            if (onStep > 0) {
                throw new ApiException(HttpStatus.CONFLICT, "Cannot delete this version because "
                        + onStep + " artifact(s) are currently on step '" + step.getName() + "'");
            }
        }
        List<Long> stepIds = steps.stream().map(WorkflowStep::getId).toList();
        List<WorkflowTransition> touching = transitionRepository.findAll().stream()
                .filter(t -> stepIds.contains(t.getFromStepId()) || stepIds.contains(t.getToStepId()))
                .toList();
        List<Long> affectedCoFire = touching.stream().map(WorkflowTransition::getCoFireGroupId)
                .filter(Objects::nonNull).distinct().toList();
        transitionRepository.deleteAll(touching);
        transitionGroupRepository.deleteByFromStepIdIn(stepIds);
        affectedCoFire.forEach(this::dissolveCoFireIfSmall);
        deleteReviewsFor(stepIds);
        flagRepository.deleteByWorkflowId(id);
        phaseRepository.deleteAll(phaseRepository.findByWorkflowIdOrderByOrderIndexAsc(id));
        stepRepository.deleteAll(steps);
        workflowRepository.deleteById(id);
        promoteCurrentIfNeeded(workflow.getGroupId());
    }

    /** After deleting a version, keep a group visible by promoting its newest remaining version to current. */
    private void promoteCurrentIfNeeded(Long groupId) {
        List<Workflow> remaining = workflowRepository.findByGroupIdOrderByVersionAsc(groupId);
        if (remaining.isEmpty() || remaining.stream().anyMatch(Workflow::isCurrent)) {
            return;
        }
        Workflow newest = remaining.get(remaining.size() - 1);
        newest.setCurrent(true);
        workflowRepository.save(newest);
    }

    Workflow requireWorkflow(Long id) {
        Workflow workflow = workflowRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Workflow not found"));
        if (!workflow.getOwnerId().equals(currentUser.requireUserId())) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Workflow not found");
        }
        return workflow;
    }

    /** Loads a step and verifies its workflow is owned by the current user. */
    private WorkflowStep requireOwnedStep(Long id) {
        WorkflowStep step = stepRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Step not found"));
        requireWorkflow(step.getWorkflowId());
        return step;
    }

    WorkflowDto toWorkflowDto(Workflow w) {
        List<String> tags = w.getTags().stream()
                .sorted(String.CASE_INSENSITIVE_ORDER)
                .toList();
        return new WorkflowDto(w.getId(), w.getName(), w.getDescription(),
                w.getStatus().name(), w.getGroupId(), w.getVersion(),
                w.getVersionLabel(), w.isCurrent(), w.getOrderIndex(),
                w.getFolderId(),
                stepRepository.countByWorkflowId(w.getId()), w.getConfidence(), tags);
    }

    WorkflowStatus parseStatus(String value) {
        try {
            return WorkflowStatus.valueOf(value.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid workflow status: " + value);
        }
    }

    /** Sets the manual trust rating (0-5) of a single version. */
    @Transactional
    public WorkflowDto setConfidence(Long id, Integer confidence) {
        if (confidence == null || confidence < 0 || confidence > 5) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Confidence must be between 0 and 5");
        }
        Workflow workflow = requireWorkflow(id);
        workflow.setConfidence(confidence);
        return toWorkflowDto(workflowRepository.save(workflow));
    }

    /** Clamps an optional imported confidence to 0-5, treating null/out-of-range as 0. */
    static int clampConfidence(Integer confidence) {
        if (confidence == null || confidence < 0 || confidence > 5) {
            return 0;
        }
        return confidence;
    }

    // ---------------- Folders ----------------

    /** Validates that the folder exists (when provided), is owned by the current user, and returns the id (null = ungrouped). */
    private Long resolveFolderId(Long folderId) {
        if (folderId == null) {
            return null;
        }
        WorkflowFolder folder = folderRepository.findById(folderId)
                .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "Folder not found: " + folderId));
        if (!folder.getOwnerId().equals(currentUser.requireUserId())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Folder not found: " + folderId);
        }
        return folderId;
    }

    // ---------------- Tags ----------------

    /** Trims, drops blanks and de-duplicates (case-insensitive, first spelling wins) free-text tags. */
    List<String> cleanTags(List<String> tags) {
        List<String> result = new ArrayList<>();
        if (tags == null) {
            return result;
        }
        Set<String> seen = new HashSet<>();
        for (String raw : tags) {
            if (raw == null || raw.isBlank()) {
                continue;
            }
            String name = raw.trim();
            if (seen.add(name.toLowerCase())) {
                result.add(name);
            }
        }
        return result;
    }

    // ---------------- Tree ----------------

    @Transactional(readOnly = true)
    public List<WorkflowStepDto> getTree(Long workflowId) {
        requireWorkflow(workflowId);
        List<WorkflowStep> steps = stepRepository.findByWorkflowIdOrderByOrderIndexAsc(workflowId);
        Map<Long, BusinessRole> roles = roleRepository.findAll().stream()
                .collect(Collectors.toMap(BusinessRole::getId, Function.identity()));
        Map<Long, WorkflowPhase> phases = phaseRepository.findAll().stream()
                .collect(Collectors.toMap(WorkflowPhase::getId, Function.identity()));
        Map<Long, List<WorkflowStep>> byParent = steps.stream()
                .collect(Collectors.groupingBy(s -> s.getParentId() == null ? 0L : s.getParentId()));
        Map<Long, String> stepNames = steps.stream()
                .collect(Collectors.toMap(WorkflowStep::getId, WorkflowStep::getName));
        List<Long> stepIds = steps.stream().map(WorkflowStep::getId).toList();
        Map<Long, List<WorkflowTransition>> byFrom = transitionRepository.findAll().stream()
                .filter(t -> stepIds.contains(t.getFromStepId()))
                .collect(Collectors.groupingBy(WorkflowTransition::getFromStepId));

        return WorkflowStepAssembler.buildChildren(0L, byParent, byFrom, loadGroups(), roles, phases,
                loadReviews(stepIds), loadFlags(steps), stepNames);
    }

    /** Flat forest of every step across all current-version workflows; used by dashboards and pickers. */
    @Transactional(readOnly = true)
    public List<WorkflowStepDto> getAllSteps() {
        Set<Long> currentIds = workflowRepository
                .findByOwnerIdAndIsCurrentTrueOrderByOrderIndexAsc(currentUser.requireUserId()).stream()
                .map(Workflow::getId).collect(Collectors.toSet());
        List<WorkflowStep> steps = stepRepository.findAllByOrderByOrderIndexAsc().stream()
                .filter(s -> currentIds.contains(s.getWorkflowId()))
                .toList();
        Map<Long, BusinessRole> roles = roleRepository.findAll().stream()
                .collect(Collectors.toMap(BusinessRole::getId, Function.identity()));
        Map<Long, WorkflowPhase> phases = phaseRepository.findAll().stream()
                .collect(Collectors.toMap(WorkflowPhase::getId, Function.identity()));
        Map<Long, List<WorkflowStep>> byParent = steps.stream()
                .collect(Collectors.groupingBy(s -> s.getParentId() == null ? 0L : s.getParentId()));
        Map<Long, String> stepNames = steps.stream()
                .collect(Collectors.toMap(WorkflowStep::getId, WorkflowStep::getName));
        Map<Long, List<WorkflowTransition>> byFrom = transitionRepository.findAll().stream()
                .collect(Collectors.groupingBy(WorkflowTransition::getFromStepId));
        return WorkflowStepAssembler.buildChildren(0L, byParent, byFrom, loadGroups(), roles, phases,
                loadReviews(stepNames.keySet()), loadFlags(steps), stepNames);
    }

    // ---------------- Steps ----------------

    @Transactional
    public WorkflowStepDto createStep(CreateStepRequest request) {
        Long workflowId;
        if (request.parentId() != null) {
            WorkflowStep parent = requireOwnedStep(request.parentId());
            workflowId = parent.getWorkflowId();
        } else {
            workflowId = request.workflowId();
            if (workflowId == null) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "Workflow not found");
            }
            requireWorkflow(workflowId);
        }
        validateRoles(request.businessRoleIds());
        validatePhase(request.phaseId(), workflowId);
        WorkflowStep step = new WorkflowStep();
        step.setWorkflowId(workflowId);
        step.setParentId(request.parentId());
        step.setName(request.name().trim());
        step.setDescription(request.description());
        step.setNotes(request.notes());
        step.setBusinessRoleIds(dedupe(request.businessRoleIds()));
        step.setPhaseId(request.phaseId());
        step.setOrderIndex(stepRepository.nextOrderIndex(request.parentId()));
        stepRepository.save(step);
        return getTreeNode(step.getId());
    }

    @Transactional
    public WorkflowStepDto updateStep(Long id, UpdateStepRequest request) {
        WorkflowStep step = requireOwnedStep(id);
        validateRoles(request.businessRoleIds());
        validatePhase(request.phaseId(), step.getWorkflowId());
        step.setName(request.name().trim());
        step.setDescription(request.description());
        step.setNotes(request.notes());
        step.setBusinessRoleIds(dedupe(request.businessRoleIds()));
        step.setPhaseId(request.phaseId());
        stepRepository.save(step);
        return getTreeNode(id);
    }

    @Transactional
    public void deleteStep(Long id) {
        requireOwnedStep(id);
        List<Long> toDelete = collectSubtreeIds(id);
        // Remove any transitions that touch a deleted step (as source or target), then prune orphaned groups.
        List<WorkflowTransition> touching = transitionRepository.findAll().stream()
                .filter(t -> toDelete.contains(t.getFromStepId()) || toDelete.contains(t.getToStepId()))
                .toList();
        List<Long> affectedGroups = touching.stream().map(WorkflowTransition::getGroupId)
                .filter(gid -> gid != null).distinct().toList();
        List<Long> affectedCoFire = touching.stream().map(WorkflowTransition::getCoFireGroupId)
                .filter(Objects::nonNull).distinct().toList();
        transitionRepository.deleteAll(touching);
        transitionGroupRepository.deleteByFromStepIdIn(toDelete);
        affectedGroups.forEach(this::deleteGroupIfEmpty);
        affectedCoFire.forEach(this::dissolveCoFireIfSmall);
        deleteReviewsFor(toDelete);
        stepRepository.deleteAllById(toDelete);
    }

    private List<Long> collectSubtreeIds(Long rootId) {
        List<Long> ids = new ArrayList<>();
        Deque<Long> queue = new ArrayDeque<>();
        queue.add(rootId);
        while (!queue.isEmpty()) {
            Long current = queue.poll();
            ids.add(current);
            stepRepository.findByParentIdOrderByOrderIndexAsc(current)
                    .forEach(child -> queue.add(child.getId()));
        }
        return ids;
    }

    // ---------------- Reviews ----------------

    @Transactional
    public StepReviewDto addReview(Long stepId, ReviewRequest request) {
        requireOwnedStep(stepId);
        StepReview review = new StepReview();
        review.setStepId(stepId);
        review.setContent(request.content().trim());
        reviewRepository.save(review);
        return WorkflowMapper.toReviewDto(review);
    }

    @Transactional
    public StepReviewDto updateReview(Long reviewId, ReviewRequest request) {
        StepReview review = reviewRepository.findById(reviewId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Review not found"));
        requireOwnedStep(review.getStepId());
        review.setContent(request.content().trim());
        reviewRepository.save(review);
        return WorkflowMapper.toReviewDto(review);
    }

    @Transactional
    public void deleteReview(Long reviewId) {
        StepReview review = reviewRepository.findById(reviewId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Review not found"));
        requireOwnedStep(review.getStepId());
        reviewRepository.deleteById(reviewId);
    }

    private Map<Long, List<StepReviewDto>> loadReviews(Collection<Long> stepIds) {
        if (stepIds.isEmpty()) {
            return Map.of();
        }
        return reviewRepository.findByStepIdInOrderByCreatedAtDescIdDesc(stepIds).stream()
                .map(WorkflowMapper::toReviewDto)
                .collect(Collectors.groupingBy(StepReviewDto::stepId));
    }

    private void deleteReviewsFor(Collection<Long> stepIds) {
        if (!stepIds.isEmpty()) {
            reviewRepository.deleteByStepIdIn(stepIds);
        }
    }

    /** Maps each given step's id to its personal flag level (if any), resolved by (workflowId, lineageKey). */
    private Map<Long, String> loadFlags(Collection<WorkflowStep> steps) {
        if (steps.isEmpty()) {
            return Map.of();
        }
        Set<Long> workflowIds = steps.stream().map(WorkflowStep::getWorkflowId).collect(Collectors.toSet());
        Map<String, String> byKey = flagRepository.findByWorkflowIdIn(workflowIds).stream()
                .collect(Collectors.toMap(f -> flagKey(f.getWorkflowId(), f.getLineageKey()),
                        StepFlag::getLevel, (a, b) -> a));
        Map<Long, String> result = new HashMap<>();
        for (WorkflowStep step : steps) {
            String level = byKey.get(flagKey(step.getWorkflowId(), step.getLineageKey()));
            if (level != null) {
                result.put(step.getId(), level);
            }
        }
        return result;
    }

    private static String flagKey(Long workflowId, String lineageKey) {
        return workflowId + "|" + lineageKey;
    }

    /** Sets or clears a step's personal importance flag; a null/blank level removes it. */
    @Transactional
    public WorkflowStepDto setStepFlag(Long stepId, String level) {
        WorkflowStep step = requireOwnedStep(stepId);
        String normalized = level == null ? null : level.trim();
        if (normalized == null || normalized.isEmpty()) {
            flagRepository.deleteByWorkflowIdAndLineageKey(step.getWorkflowId(), step.getLineageKey());
        } else {
            if (!ALLOWED_FLAG_LEVELS.contains(normalized)) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "Unknown flag level: " + normalized);
            }
            StepFlag flag = flagRepository
                    .findByWorkflowIdAndLineageKey(step.getWorkflowId(), step.getLineageKey())
                    .orElseGet(StepFlag::new);
            flag.setWorkflowId(step.getWorkflowId());
            flag.setLineageKey(step.getLineageKey());
            flag.setLevel(normalized);
            flagRepository.save(flag);
        }
        return getTreeNode(stepId);
    }

    // ---------------- Transitions (branching) ----------------

    @Transactional
    public TransitionDto createTransition(CreateTransitionRequest request) {
        if (request.fromStepId().equals(request.toStepId())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "A step cannot transition to itself");
        }
        WorkflowStep from = stepRepository.findById(request.fromStepId())
                .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "Source step not found"));
        WorkflowStep to = stepRepository.findById(request.toStepId())
                .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "Target step not found"));
        requireWorkflow(from.getWorkflowId());
        requireWorkflow(to.getWorkflowId());
        if (transitionRepository.existsByFromStepIdAndToStepId(from.getId(), to.getId())) {
            throw new ApiException(HttpStatus.CONFLICT, "Transition already exists");
        }
        TransitionGroup group = findOrCreateGroup(from.getId(), request.label());
        WorkflowTransition transition = new WorkflowTransition();
        transition.setGroupId(group.getId());
        transition.setFromStepId(from.getId());
        transition.setToStepId(to.getId());
        transition.setOrderIndex(transitionRepository.findByGroupIdOrderByOrderIndexAsc(group.getId()).size());
        transitionRepository.save(transition);
        return new TransitionDto(transition.getId(), from.getId(), to.getId(), to.getName(),
                group.getLabel(), transition.getOrderIndex(), group.getId(), group.getOrderIndex(),
                transition.getCoFireGroupId());
    }

    @Transactional
    public void deleteTransition(Long id) {
        WorkflowTransition transition = transitionRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Transition not found"));
        requireOwnedStep(transition.getFromStepId());
        Long groupId = transition.getGroupId();
        Long coFireGroupId = transition.getCoFireGroupId();
        transitionRepository.delete(transition);
        deleteGroupIfEmpty(groupId);
        dissolveCoFireIfSmall(coFireGroupId);
    }

    /** Creates a new condition group on {@code fromStepId} whose targets all start together (AND fan-out). */
    @Transactional
    public List<TransitionDto> createTransitionGroup(CreateTransitionGroupRequest request) {
        requireOwnedStep(request.fromStepId());
        TransitionGroup group = new TransitionGroup();
        group.setFromStepId(request.fromStepId());
        group.setOrderIndex(transitionGroupRepository.findByFromStepIdOrderByOrderIndexAsc(request.fromStepId()).size());
        transitionGroupRepository.save(group);
        return syncGroupTargets(group, request.toStepIds(), request.label());
    }

    /** Renames one condition group and syncs its target steps to exactly {@code toStepIds}. Only this group is touched. */
    @Transactional
    public List<TransitionDto> updateTransitionGroup(Long groupId, UpdateTransitionGroupRequest request) {
        TransitionGroup group = transitionGroupRepository.findById(groupId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Condition group not found"));
        requireOwnedStep(group.getFromStepId());
        return syncGroupTargets(group, request.toStepIds(), request.label());
    }

    /** Syncs {@code group}'s edges to exactly {@code toStepIds}, setting its label. Only this group is touched. */
    private List<TransitionDto> syncGroupTargets(TransitionGroup group, List<Long> toStepIds, String rawLabel) {
        Long groupId = group.getId();
        Long fromStepId = group.getFromStepId();

        List<Long> desired = toStepIds.stream().distinct().toList();
        if (desired.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "A condition must keep at least one target step");
        }

        List<WorkflowTransition> current = transitionRepository.findByGroupIdOrderByOrderIndexAsc(groupId);
        Set<Long> currentTargets = current.stream().map(WorkflowTransition::getToStepId).collect(Collectors.toSet());
        Set<Long> desiredSet = new HashSet<>(desired);

        Map<Long, WorkflowStep> targets = new HashMap<>();
        for (Long toId : desired) {
            if (toId.equals(fromStepId)) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "A step cannot transition to itself");
            }
            WorkflowStep to = stepRepository.findById(toId)
                    .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "Target step not found"));
            // A new target must not already exist on another condition of the same source step.
            if (!currentTargets.contains(toId) && transitionRepository.existsByFromStepIdAndToStepId(fromStepId, toId)) {
                throw new ApiException(HttpStatus.CONFLICT, "Transition to \"" + to.getName() + "\" already exists");
            }
            targets.put(toId, to);
        }

        current.stream()
                .filter(t -> !desiredSet.contains(t.getToStepId()))
                .forEach(transitionRepository::delete);

        Map<Long, WorkflowTransition> keptByTarget = current.stream()
                .filter(t -> desiredSet.contains(t.getToStepId()))
                .collect(Collectors.toMap(WorkflowTransition::getToStepId, Function.identity()));

        String label = rawLabel == null || rawLabel.isBlank() ? null : rawLabel.trim();
        group.setLabel(label);
        transitionGroupRepository.save(group);

        List<TransitionDto> result = new ArrayList<>();
        int index = 0;
        for (Long toId : desired) {
            WorkflowTransition transition = keptByTarget.get(toId);
            if (transition == null) {
                transition = new WorkflowTransition();
                transition.setGroupId(groupId);
                transition.setFromStepId(fromStepId);
                transition.setToStepId(toId);
            }
            transition.setOrderIndex(index++);
            transitionRepository.save(transition);
            result.add(new TransitionDto(transition.getId(), fromStepId, toId, targets.get(toId).getName(),
                    label, transition.getOrderIndex(), groupId, group.getOrderIndex(),
                    transition.getCoFireGroupId()));
        }
        return result;
    }

    /** Returns the source step's group for {@code label} (null/blank = the unconditional group), creating it if absent. */
    private TransitionGroup findOrCreateGroup(Long fromStepId, String rawLabel) {
        String label = rawLabel == null || rawLabel.isBlank() ? null : rawLabel.trim();
        List<TransitionGroup> matches = transitionGroupRepository.findMatching(fromStepId, label);
        if (!matches.isEmpty()) {
            return matches.get(0);
        }
        TransitionGroup group = new TransitionGroup();
        group.setFromStepId(fromStepId);
        group.setLabel(label);
        group.setOrderIndex(transitionGroupRepository.findByFromStepIdOrderByOrderIndexAsc(fromStepId).size());
        return transitionGroupRepository.save(group);
    }

    private void deleteGroupIfEmpty(Long groupId) {
        if (groupId != null && !transitionRepository.existsByGroupId(groupId)) {
            transitionGroupRepository.deleteById(groupId);
        }
    }

    // ---------------- Co-fire groups (synchronizing arrivals) ----------------

    /** Groups >=2 transitions sharing a target into a new co-fire group; they must all fire before it starts. */
    @Transactional
    public List<TransitionDto> createCoFireGroup(CoFireGroupRequest request) {
        List<WorkflowTransition> members = loadCoFireMembers(request.transitionIds());
        requireOwnedStep(members.get(0).getFromStepId());
        Long toStepId = members.get(0).getToStepId();
        TransitionCoFireGroup group = new TransitionCoFireGroup();
        group.setToStepId(toStepId);
        group.setOrderIndex(coFireGroupRepository.findByToStepIdOrderByOrderIndexAsc(toStepId).size());
        coFireGroupRepository.save(group);
        return assignCoFireMembers(group, members);
    }

    /** Sets a co-fire group's membership to exactly {@code transitionIds}; released edges fire independently. */
    @Transactional
    public List<TransitionDto> updateCoFireGroup(Long groupId, CoFireGroupRequest request) {
        TransitionCoFireGroup group = coFireGroupRepository.findById(groupId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Co-fire group not found"));
        List<WorkflowTransition> members = loadCoFireMembers(request.transitionIds());
        requireOwnedStep(members.get(0).getFromStepId());
        if (!members.get(0).getToStepId().equals(group.getToStepId())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Co-fire members must target this group's step");
        }
        Set<Long> keep = members.stream().map(WorkflowTransition::getId).collect(Collectors.toSet());
        transitionRepository.findByCoFireGroupId(groupId).stream()
                .filter(t -> !keep.contains(t.getId()))
                .forEach(t -> {
                    t.setCoFireGroupId(null);
                    transitionRepository.save(t);
                });
        return assignCoFireMembers(group, members);
    }

    /** Dissolves a co-fire group; its member edges become independent arrivals again. */
    @Transactional
    public void deleteCoFireGroup(Long groupId) {
        if (!coFireGroupRepository.existsById(groupId)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Co-fire group not found");
        }
        List<WorkflowTransition> members = transitionRepository.findByCoFireGroupId(groupId);
        if (!members.isEmpty()) {
            requireOwnedStep(members.get(0).getFromStepId());
        }
        members.forEach(t -> {
            t.setCoFireGroupId(null);
            transitionRepository.save(t);
        });
        coFireGroupRepository.deleteById(groupId);
    }

    private List<WorkflowTransition> loadCoFireMembers(List<Long> transitionIds) {
        List<Long> ids = transitionIds == null ? List.of() : transitionIds.stream().distinct().toList();
        if (ids.size() < 2) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "A co-fire group needs at least two transitions");
        }
        List<WorkflowTransition> members = new ArrayList<>();
        Long toStepId = null;
        for (Long id : ids) {
            WorkflowTransition t = transitionRepository.findById(id)
                    .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "Transition not found"));
            if (toStepId == null) {
                toStepId = t.getToStepId();
            } else if (!toStepId.equals(t.getToStepId())) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "Co-fire transitions must share the same target step");
            }
            members.add(t);
        }
        return members;
    }

    private List<TransitionDto> assignCoFireMembers(TransitionCoFireGroup group, List<WorkflowTransition> members) {
        List<TransitionDto> result = new ArrayList<>();
        for (WorkflowTransition t : members) {
            Long previous = t.getCoFireGroupId();
            t.setCoFireGroupId(group.getId());
            transitionRepository.save(t);
            if (previous != null && !previous.equals(group.getId())) {
                dissolveCoFireIfSmall(previous);
            }
            result.add(toTransitionDto(t));
        }
        return result;
    }

    /** Removes a co-fire group once it can no longer synchronize anything (fewer than two members). */
    private void dissolveCoFireIfSmall(Long groupId) {
        if (groupId == null) {
            return;
        }
        List<WorkflowTransition> members = transitionRepository.findByCoFireGroupId(groupId);
        if (members.size() < 2) {
            members.forEach(t -> {
                t.setCoFireGroupId(null);
                transitionRepository.save(t);
            });
            coFireGroupRepository.deleteById(groupId);
        }
    }

    private TransitionDto toTransitionDto(WorkflowTransition t) {
        TransitionGroup g = t.getGroupId() == null ? null
                : transitionGroupRepository.findById(t.getGroupId()).orElse(null);
        String toName = stepRepository.findById(t.getToStepId()).map(WorkflowStep::getName).orElse(null);
        return new TransitionDto(t.getId(), t.getFromStepId(), t.getToStepId(), toName,
                g == null ? null : g.getLabel(), t.getOrderIndex(),
                t.getGroupId(), g == null ? 0 : g.getOrderIndex(), t.getCoFireGroupId());
    }

    private Map<Long, TransitionGroup> loadGroups() {
        return transitionGroupRepository.findAll().stream()
                .collect(Collectors.toMap(TransitionGroup::getId, Function.identity()));
    }

    // ---------------- Role-filtered view ----------------

    @Transactional(readOnly = true)
    public List<WorkflowStepDto> getStepsByRole(Long roleId) {
        BusinessRole role = roleRepository.findById(roleId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Role not found"));
        if (!role.getOwnerId().equals(currentUser.requireUserId())) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Role not found");
        }
        Map<Long, BusinessRole> roles = roleRepository.findAll().stream()
                .collect(Collectors.toMap(BusinessRole::getId, Function.identity()));
        Map<Long, WorkflowPhase> phases = phaseRepository.findAll().stream()
                .collect(Collectors.toMap(WorkflowPhase::getId, Function.identity()));
        Set<Long> currentIds = workflowRepository
                .findByOwnerIdAndIsCurrentTrueOrderByOrderIndexAsc(currentUser.requireUserId()).stream()
                .map(Workflow::getId).collect(Collectors.toSet());
        List<WorkflowStep> steps = stepRepository.findByBusinessRoleIdOrderByOrderIndexAsc(roleId).stream()
                .filter(step -> currentIds.contains(step.getWorkflowId()))
                .toList();
        Map<Long, String> flags = loadFlags(steps);
        return steps.stream()
                .map(step -> {
                    List<BusinessRoleDto> roleDtos = step.getBusinessRoleIds().stream()
                            .map(roles::get)
                            .filter(Objects::nonNull)
                            .map(WorkflowMapper::toRoleDto)
                            .toList();
                    WorkflowPhase phase = step.getPhaseId() == null ? null : phases.get(step.getPhaseId());
                    return new WorkflowStepDto(step.getId(), step.getWorkflowId(), step.getParentId(), step.getOrderIndex(),
                            step.getName(), step.getDescription(), step.getNotes(), step.getLineageKey(), roleDtos,
                            phase == null ? null : WorkflowMapper.toPhaseDto(phase), List.of(), List.of(), List.of(),
                            flags.get(step.getId()));
                })
                .toList();
    }

    // ---------------- Helpers ----------------

    private WorkflowStepDto getTreeNode(Long id) {
        WorkflowStep step = stepRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Step not found"));
        Map<Long, BusinessRole> roles = roleRepository.findAll().stream()
                .collect(Collectors.toMap(BusinessRole::getId, Function.identity()));
        Map<Long, WorkflowPhase> phases = phaseRepository.findAll().stream()
                .collect(Collectors.toMap(WorkflowPhase::getId, Function.identity()));
        Map<Long, List<WorkflowStep>> byParent = stepRepository.findAllByOrderByOrderIndexAsc().stream()
                .collect(Collectors.groupingBy(s -> s.getParentId() == null ? 0L : s.getParentId()));
        Map<Long, String> stepNames = stepRepository.findAllByOrderByOrderIndexAsc().stream()
                .collect(Collectors.toMap(WorkflowStep::getId, WorkflowStep::getName));
        Map<Long, List<WorkflowTransition>> byFrom = transitionRepository.findAll().stream()
                .collect(Collectors.groupingBy(WorkflowTransition::getFromStepId));
        return WorkflowStepAssembler.toStepDto(step, byParent, byFrom, loadGroups(), roles, phases,
                loadReviews(List.of(step.getId())), loadFlags(List.of(step)), stepNames);
    }

    private void validateRole(Long roleId) {
        if (roleId == null) {
            return;
        }
        BusinessRole role = roleRepository.findById(roleId)
                .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "Business role not found"));
        if (!role.getOwnerId().equals(currentUser.requireUserId())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Business role not found");
        }
    }

    private void validateRoles(List<Long> roleIds) {
        if (roleIds == null) {
            return;
        }
        for (Long roleId : roleIds) {
            validateRole(roleId);
        }
    }

    /** Returns a null-safe, order-preserving, de-duplicated copy of the given role ids. */
    private List<Long> dedupe(List<Long> roleIds) {
        if (roleIds == null) {
            return new ArrayList<>();
        }
        LinkedHashSet<Long> unique = new LinkedHashSet<>();
        for (Long roleId : roleIds) {
            if (roleId != null) {
                unique.add(roleId);
            }
        }
        return new ArrayList<>(unique);
    }

    private void validatePhase(Long phaseId, Long workflowId) {
        if (phaseId == null) {
            return;
        }
        WorkflowPhase phase = phaseRepository.findById(phaseId)
                .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "Phase not found"));
        if (!phase.getWorkflowId().equals(workflowId)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Phase does not belong to the step's workflow");
        }
    }
}
