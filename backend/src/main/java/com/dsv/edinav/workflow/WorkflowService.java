package com.dsv.edinav.workflow;

import com.dsv.edinav.common.ApiException;
import com.dsv.edinav.artifact.ArtifactRepository;
import com.dsv.edinav.workflow.dto.BusinessRoleDto;
import com.dsv.edinav.workflow.dto.CreateStepRequest;
import com.dsv.edinav.workflow.dto.CreateTransitionRequest;
import com.dsv.edinav.workflow.dto.TransitionDto;
import com.dsv.edinav.workflow.dto.UpdateStepRequest;
import com.dsv.edinav.workflow.dto.WorkflowDto;
import com.dsv.edinav.workflow.dto.WorkflowRequest;
import com.dsv.edinav.workflow.dto.WorkflowStepDto;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
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
    private final BusinessRoleRepository roleRepository;
    private final WorkflowPhaseRepository phaseRepository;
    private final WorkflowFolderRepository folderRepository;
    private final ArtifactRepository artifactRepository;

    public WorkflowService(WorkflowRepository workflowRepository,
                           WorkflowStepRepository stepRepository,
                           WorkflowTransitionRepository transitionRepository,
                           BusinessRoleRepository roleRepository,
                           WorkflowPhaseRepository phaseRepository,
                           WorkflowFolderRepository folderRepository,
                           ArtifactRepository artifactRepository) {
        this.workflowRepository = workflowRepository;
        this.stepRepository = stepRepository;
        this.transitionRepository = transitionRepository;
        this.roleRepository = roleRepository;
        this.phaseRepository = phaseRepository;
        this.folderRepository = folderRepository;
        this.artifactRepository = artifactRepository;
    }

    // ---------------- Workflows (containers) ----------------

    @Transactional(readOnly = true)
    public List<WorkflowDto> getWorkflows() {
        return workflowRepository.findByIsCurrentTrueOrderByOrderIndexAsc().stream()
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
        if (workflowRepository.existsByNameIgnoreCase(request.name().trim())) {
            throw new ApiException(HttpStatus.CONFLICT, "Workflow name already exists");
        }
        Workflow workflow = new Workflow();
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
        if (workflowRepository.existsByNameIgnoreCaseAndGroupIdNot(name, workflow.getGroupId())) {
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
        transitionRepository.findAll().stream()
                .filter(t -> stepIds.contains(t.getFromStepId()) || stepIds.contains(t.getToStepId()))
                .forEach(transitionRepository::delete);
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
        return workflowRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Workflow not found"));
    }

    WorkflowDto toWorkflowDto(Workflow w) {
        List<String> tags = w.getTags().stream()
                .sorted(String.CASE_INSENSITIVE_ORDER)
                .toList();
        return new WorkflowDto(w.getId(), w.getName(), w.getDescription(),
                w.getStatus().name(), w.getGroupId(), w.getVersion(),
                w.getVersionLabel(), w.isCurrent(), w.getOrderIndex(),
                w.getFolderId(),
                stepRepository.countByWorkflowId(w.getId()), tags);
    }

    WorkflowStatus parseStatus(String value) {
        try {
            return WorkflowStatus.valueOf(value.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid workflow status: " + value);
        }
    }

    // ---------------- Folders ----------------

    /** Validates that the folder exists (when provided) and returns the id unchanged (null = ungrouped). */
    private Long resolveFolderId(Long folderId) {
        if (folderId == null) {
            return null;
        }
        if (!folderRepository.existsById(folderId)) {
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

        return WorkflowStepAssembler.buildChildren(0L, byParent, byFrom, roles, phases, stepNames);
    }

    /** Flat forest of every step across all current-version workflows; used by dashboards and pickers. */
    @Transactional(readOnly = true)
    public List<WorkflowStepDto> getAllSteps() {
        Set<Long> currentIds = workflowRepository.findByIsCurrentTrueOrderByOrderIndexAsc().stream()
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
        return WorkflowStepAssembler.buildChildren(0L, byParent, byFrom, roles, phases, stepNames);
    }

    // ---------------- Steps ----------------

    @Transactional
    public WorkflowStepDto createStep(CreateStepRequest request) {
        Long workflowId;
        if (request.parentId() != null) {
            WorkflowStep parent = stepRepository.findById(request.parentId())
                    .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "Parent step not found"));
            workflowId = parent.getWorkflowId();
        } else {
            workflowId = request.workflowId();
            if (workflowId == null || !workflowRepository.existsById(workflowId)) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "Workflow not found");
            }
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
        WorkflowStep step = stepRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Step not found"));
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
        if (!stepRepository.existsById(id)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Step not found");
        }
        List<Long> toDelete = collectSubtreeIds(id);
        // Remove any transitions that touch a deleted step (as source or target).
        transitionRepository.findAll().stream()
                .filter(t -> toDelete.contains(t.getFromStepId()) || toDelete.contains(t.getToStepId()))
                .forEach(transitionRepository::delete);
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
        if (transitionRepository.existsByFromStepIdAndToStepId(from.getId(), to.getId())) {
            throw new ApiException(HttpStatus.CONFLICT, "Transition already exists");
        }
        WorkflowTransition transition = new WorkflowTransition();
        transition.setFromStepId(from.getId());
        transition.setToStepId(to.getId());
        transition.setLabel(request.label());
        int order = transitionRepository.findByFromStepIdOrderByOrderIndexAsc(from.getId()).size();
        transition.setOrderIndex(order);
        transitionRepository.save(transition);
        return new TransitionDto(transition.getId(), from.getId(), to.getId(), to.getName(),
                transition.getLabel(), transition.getOrderIndex());
    }

    @Transactional
    public void deleteTransition(Long id) {
        if (!transitionRepository.existsById(id)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Transition not found");
        }
        transitionRepository.deleteById(id);
    }

    // ---------------- Role-filtered view ----------------

    @Transactional(readOnly = true)
    public List<WorkflowStepDto> getStepsByRole(Long roleId) {
        if (!roleRepository.existsById(roleId)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Role not found");
        }
        Map<Long, BusinessRole> roles = roleRepository.findAll().stream()
                .collect(Collectors.toMap(BusinessRole::getId, Function.identity()));
        Map<Long, WorkflowPhase> phases = phaseRepository.findAll().stream()
                .collect(Collectors.toMap(WorkflowPhase::getId, Function.identity()));
        Set<Long> currentIds = workflowRepository.findByIsCurrentTrueOrderByOrderIndexAsc().stream()
                .map(Workflow::getId).collect(Collectors.toSet());
        return stepRepository.findByBusinessRoleIdOrderByOrderIndexAsc(roleId).stream()
                .filter(step -> currentIds.contains(step.getWorkflowId()))
                .map(step -> {
                    List<BusinessRoleDto> roleDtos = step.getBusinessRoleIds().stream()
                            .map(roles::get)
                            .filter(Objects::nonNull)
                            .map(WorkflowMapper::toRoleDto)
                            .toList();
                    WorkflowPhase phase = step.getPhaseId() == null ? null : phases.get(step.getPhaseId());
                    return new WorkflowStepDto(step.getId(), step.getWorkflowId(), step.getParentId(), step.getOrderIndex(),
                            step.getName(), step.getDescription(), step.getNotes(), step.getLineageKey(), roleDtos,
                            phase == null ? null : WorkflowMapper.toPhaseDto(phase), List.of(), List.of());
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
        return WorkflowStepAssembler.toStepDto(step, byParent, byFrom, roles, phases, stepNames);
    }

    private void validateRole(Long roleId) {
        if (roleId != null && !roleRepository.existsById(roleId)) {
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
