package com.dsv.edinav.workflow;

import com.dsv.edinav.artifact.ArtifactRepository;
import com.dsv.edinav.common.ApiException;
import com.dsv.edinav.security.CurrentUserService;
import com.dsv.edinav.workflow.dto.BundleImportResult;
import com.dsv.edinav.workflow.dto.ConflictPolicy;
import com.dsv.edinav.workflow.dto.CreateVersionRequest;
import com.dsv.edinav.workflow.dto.ImportPhaseNode;
import com.dsv.edinav.workflow.dto.ImportReviewNode;
import com.dsv.edinav.workflow.dto.ImportStepNode;
import com.dsv.edinav.workflow.dto.ImportTransition;
import com.dsv.edinav.workflow.dto.ImportWorkflowRequest;
import com.dsv.edinav.workflow.dto.WorkflowBundle;
import com.dsv.edinav.workflow.dto.WorkflowDto;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.time.Instant;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Import, export, versioned-clone and update-from-import for workflows — the JSON round-trip core.
 * Shares small container helpers (dto mapping, status/tag parsing, group save, lookup) with
 * {@link WorkflowService}; those are the only cross-bean calls and involve no separate transaction.
 */
@Service
public class WorkflowImportExportService {

    private final WorkflowRepository workflowRepository;
    private final WorkflowStepRepository stepRepository;
    private final WorkflowTransitionRepository transitionRepository;
    private final TransitionGroupRepository transitionGroupRepository;
    private final TransitionCoFireGroupRepository coFireGroupRepository;
    private final BusinessRoleRepository roleRepository;
    private final WorkflowPhaseRepository phaseRepository;
    private final ArtifactRepository artifactRepository;
    private final StepReviewRepository reviewRepository;
    private final WorkflowService workflowService;
    private final ObjectProvider<WorkflowImportExportService> self;
    private final CurrentUserService currentUser;

    public WorkflowImportExportService(WorkflowRepository workflowRepository,
                                       WorkflowStepRepository stepRepository,
                                       WorkflowTransitionRepository transitionRepository,
                                       TransitionGroupRepository transitionGroupRepository,
                                       TransitionCoFireGroupRepository coFireGroupRepository,
                                       BusinessRoleRepository roleRepository,
                                       WorkflowPhaseRepository phaseRepository,
                                       ArtifactRepository artifactRepository,
                                       StepReviewRepository reviewRepository,
                                       WorkflowService workflowService,
                                       ObjectProvider<WorkflowImportExportService> self,
                                       CurrentUserService currentUser) {
        this.workflowRepository = workflowRepository;
        this.stepRepository = stepRepository;
        this.transitionRepository = transitionRepository;
        this.transitionGroupRepository = transitionGroupRepository;
        this.coFireGroupRepository = coFireGroupRepository;
        this.roleRepository = roleRepository;
        this.phaseRepository = phaseRepository;
        this.artifactRepository = artifactRepository;
        this.reviewRepository = reviewRepository;
        this.workflowService = workflowService;
        this.self = self;
        this.currentUser = currentUser;
    }

    // ---------------- Import ----------------

    @Transactional
    public WorkflowDto importWorkflow(ImportWorkflowRequest request) {
        Long ownerId = currentUser.requireUserId();
        String name = request.name() == null ? null : request.name().trim();
        if (name == null || name.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Workflow name is required");
        }
        if (workflowRepository.existsByNameIgnoreCaseAndOwnerId(name, ownerId)) {
            throw new ApiException(HttpStatus.CONFLICT, "Workflow name already exists");
        }
        Workflow workflow = new Workflow();
        workflow.setOwnerId(ownerId);
        workflow.setName(name);
        workflow.setDescription(request.description());
        workflow.setStatus(request.status() == null ? WorkflowStatus.DRAFT : workflowService.parseStatus(request.status()));
        workflow.setOrderIndex(workflowRepository.nextOrderIndex());
        workflow.setConfidence(WorkflowService.clampConfidence(request.confidence()));
        workflow.setTags(workflowService.cleanTags(request.tags()));
        workflowService.saveAsNewGroup(workflow);
        populateFromImport(workflow, request, ownerId);
        return workflowService.toWorkflowDto(workflow);
    }

    /** Creates the phases, step tree and transitions of {@code workflow} from an import payload. */
    private void populateFromImport(Workflow workflow, ImportWorkflowRequest request, Long ownerId) {
        Map<String, Long> refToId = new LinkedHashMap<>();
        Map<String, BusinessRole> roleCache = new HashMap<>();
        Map<String, Long> phaseRefToId = importPhases(request.phases(), workflow.getId());
        importSteps(request.steps(), null, workflow.getId(), refToId, roleCache, phaseRefToId, ownerId);
        importTransitions(request.transitions(), refToId);
    }

    // ---------------- Bundle (multi-workflow) import ----------------

    /**
     * Imports every workflow in a bundle, each in its own transaction so one failure or name
     * clash never rolls back the rest. Successes and failures are reported per item.
     */
    public BundleImportResult importBundle(WorkflowBundle bundle, ConflictPolicy policy) {
        if (bundle == null || bundle.workflows() == null || bundle.workflows().isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Bundle contains no workflows");
        }
        ConflictPolicy effective = policy == null ? ConflictPolicy.SKIP : policy;
        List<BundleImportResult.Imported> imported = new ArrayList<>();
        List<BundleImportResult.Failed> failed = new ArrayList<>();
        for (ImportWorkflowRequest req : bundle.workflows()) {
            String name = req == null || req.name() == null ? "(unnamed)" : req.name().trim();
            try {
                WorkflowDto dto = self.getObject().importOne(req, effective);
                imported.add(new BundleImportResult.Imported(dto.id(), dto.name()));
            } catch (ApiException e) {
                failed.add(new BundleImportResult.Failed(name, e.getMessage()));
            } catch (RuntimeException e) {
                failed.add(new BundleImportResult.Failed(name,
                        e.getMessage() == null ? "Import failed" : e.getMessage()));
            }
        }
        return new BundleImportResult(imported, failed);
    }

    /** Imports one workflow from a bundle, applying the conflict policy. Own transaction (via proxy). */
    @Transactional
    public WorkflowDto importOne(ImportWorkflowRequest request, ConflictPolicy policy) {
        if (request == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Missing workflow entry");
        }
        Long ownerId = currentUser.requireUserId();
        String name = request.name() == null ? null : request.name().trim();
        if (policy == ConflictPolicy.RENAME && name != null && !name.isEmpty()
                && workflowRepository.existsByNameIgnoreCaseAndOwnerId(name, ownerId)) {
            return importWorkflow(withName(request, uniqueName(name, ownerId)));
        }
        return importWorkflow(request);
    }

    private static ImportWorkflowRequest withName(ImportWorkflowRequest r, String name) {
        return new ImportWorkflowRequest(name, r.description(), r.status(), r.confidence(),
                r.tags(), r.phases(), r.steps(), r.transitions());
    }

    /** Finds a free name (within the owner's workflows) by appending "(imported)" / "(imported N)" suffixes. */
    private String uniqueName(String base, Long ownerId) {
        String candidate = base + " (imported)";
        if (!workflowRepository.existsByNameIgnoreCaseAndOwnerId(candidate, ownerId)) {
            return trimName(candidate);
        }
        for (int i = 2; i < 1000; i++) {
            candidate = base + " (imported " + i + ")";
            if (!workflowRepository.existsByNameIgnoreCaseAndOwnerId(candidate, ownerId)) {
                return trimName(candidate);
            }
        }
        return trimName(base + " (" + System.currentTimeMillis() + ")");
    }

    private static String trimName(String name) {
        return name.length() <= 200 ? name : name.substring(0, 200);
    }

    /** Creates a new editable version (deep copy) of a workflow within the same group; not current. */
    @Transactional
    public WorkflowDto createVersion(Long sourceId, CreateVersionRequest request) {
        Workflow source = workflowService.requireWorkflow(sourceId);
        ImportWorkflowRequest snapshot = exportWorkflow(sourceId, true, true);
        Workflow version = new Workflow();
        version.setOwnerId(source.getOwnerId());
        version.setName(source.getName());
        version.setDescription(source.getDescription());
        version.setStatus(source.getStatus());
        version.setGroupId(source.getGroupId());
        version.setVersion(workflowRepository.nextVersion(source.getGroupId()));
        version.setVersionLabel(request == null ? null : request.label());
        version.setCurrent(false);
        version.setOrderIndex(source.getOrderIndex());
        version.setFolderId(source.getFolderId());
        version.setConfidence(source.getConfidence());
        version.setTags(new ArrayList<>(source.getTags()));
        workflowRepository.save(version);
        populateFromImport(version, snapshot, source.getOwnerId());
        return workflowService.toWorkflowDto(version);
    }

    private void importSteps(List<ImportStepNode> nodes, Long parentId, Long workflowId,
                             Map<String, Long> refToId, Map<String, BusinessRole> roleCache,
                             Map<String, Long> phaseRefToId, Long ownerId) {
        if (nodes == null) {
            return;
        }
        int order = 0;
        for (ImportStepNode node : nodes) {
            String ref = node.ref() == null ? null : node.ref().trim();
            if (ref == null || ref.isEmpty()) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "Every step needs a non-empty 'ref'");
            }
            if (refToId.containsKey(ref)) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "Duplicate step ref: " + ref);
            }
            if (node.name() == null || node.name().isBlank()) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "Step '" + ref + "' is missing a name");
            }
            WorkflowStep step = new WorkflowStep();
            step.setWorkflowId(workflowId);
            step.setParentId(parentId);
            step.setName(node.name().trim());
            step.setDescription(node.description());
            step.setNotes(node.notes());
            step.setLineageKey(node.lineageKey());
            step.setBusinessRoleIds(resolveRoles(node.roles(), node.role(), roleCache, ownerId));
            step.setPhaseId(resolveImportedPhase(node.phase(), phaseRefToId));
            step.setOrderIndex(order++);
            stepRepository.save(step);
            saveReviews(step.getId(), node.reviews());
            refToId.put(ref, step.getId());
            importSteps(node.children(), step.getId(), workflowId, refToId, roleCache, phaseRefToId, ownerId);
        }
    }

    /** Creates each imported phase and returns a map from its caller {@code ref} (or name) to the new id. */
    private Map<String, Long> importPhases(List<ImportPhaseNode> phases, Long workflowId) {
        Map<String, Long> refToId = new LinkedHashMap<>();
        if (phases == null) {
            return refToId;
        }
        int order = 0;
        for (ImportPhaseNode node : phases) {
            if (node.name() == null || node.name().isBlank()) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "Every phase needs a name");
            }
            WorkflowPhase phase = new WorkflowPhase();
            phase.setWorkflowId(workflowId);
            phase.setName(node.name().trim());
            phase.setColor(node.color());
            phase.setDescription(node.description());
            phase.setOrderIndex(node.orderIndex() != null ? node.orderIndex() : order);
            phaseRepository.save(phase);
            String key = node.ref() != null && !node.ref().isBlank() ? node.ref().trim() : node.name().trim();
            refToId.put(key, phase.getId());
            order++;
        }
        return refToId;
    }

    /** Persists an imported step's reviews, defaulting a missing {@code createdAt} to now. Skipped when null. */
    private void saveReviews(Long stepId, List<ImportReviewNode> reviews) {
        if (reviews == null) {
            return;
        }
        for (ImportReviewNode node : reviews) {
            if (node == null || node.content() == null || node.content().isBlank()) {
                continue;
            }
            StepReview review = new StepReview();
            review.setStepId(stepId);
            review.setContent(node.content().trim());
            Instant createdAt = node.createdAt() != null ? node.createdAt() : Instant.now();
            review.setCreatedAt(createdAt);
            review.setUpdatedAt(createdAt);
            reviewRepository.save(review);
        }
    }

    /** On update-import, replace a step's reviews only when the JSON carries them; a null list keeps existing. */
    private void replaceReviewsOnUpdate(Long stepId, List<ImportReviewNode> reviews) {
        if (reviews == null) {
            return;
        }
        reviewRepository.deleteByStepId(stepId);
        saveReviews(stepId, reviews);
    }

    private Long resolveImportedPhase(String phaseRef, Map<String, Long> phaseRefToId) {
        if (phaseRef == null || phaseRef.isBlank()) {
            return null;
        }
        Long id = phaseRefToId.get(phaseRef.trim());
        if (id == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Step references an unknown phase: " + phaseRef);
        }
        return id;
    }

    private void importTransitions(List<ImportTransition> transitions, Map<String, Long> refToId) {
        if (transitions == null) {
            return;
        }
        Map<Long, Integer> groupOrderByFrom = new HashMap<>();
        Map<String, TransitionGroup> groupCache = new HashMap<>();
        Map<Long, Integer> edgeOrderByGroup = new HashMap<>();
        Map<String, List<WorkflowTransition>> coFireByRef = new LinkedHashMap<>();
        for (ImportTransition t : transitions) {
            Long fromId = requireRefId(t.from(), refToId, "transition 'from'");
            Long toId = requireRefId(t.to(), refToId, "transition 'to'");
            if (fromId.equals(toId)) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "A step cannot transition to itself: " + t.from());
            }
            String label = t.label() == null || t.label().isBlank() ? null : t.label().trim();
            String key = fromId + "|" + (label == null ? "" : label);
            TransitionGroup group = groupCache.computeIfAbsent(key, k -> {
                TransitionGroup g = new TransitionGroup();
                g.setFromStepId(fromId);
                g.setLabel(label);
                g.setOrderIndex(groupOrderByFrom.merge(fromId, 1, Integer::sum) - 1);
                return transitionGroupRepository.save(g);
            });
            WorkflowTransition transition = new WorkflowTransition();
            transition.setGroupId(group.getId());
            transition.setFromStepId(fromId);
            transition.setToStepId(toId);
            transition.setOrderIndex(edgeOrderByGroup.merge(group.getId(), 1, Integer::sum) - 1);
            transitionRepository.save(transition);
            String coFireRef = t.coFireGroup() == null || t.coFireGroup().isBlank() ? null : t.coFireGroup().trim();
            if (coFireRef != null) {
                coFireByRef.computeIfAbsent(coFireRef, k -> new ArrayList<>()).add(transition);
            }
        }
        assignImportedCoFireGroups(coFireByRef);
    }

    /** Turns each imported co-fire ref into a group, once its members share a target and number at least two. */
    private void assignImportedCoFireGroups(Map<String, List<WorkflowTransition>> coFireByRef) {
        Map<Long, Integer> orderByTarget = new HashMap<>();
        for (List<WorkflowTransition> members : coFireByRef.values()) {
            if (members.size() < 2) {
                continue;
            }
            Long toStepId = members.get(0).getToStepId();
            boolean sameTarget = members.stream().allMatch(m -> m.getToStepId().equals(toStepId));
            if (!sameTarget) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "Co-fire transitions must share the same target step");
            }
            TransitionCoFireGroup group = new TransitionCoFireGroup();
            group.setToStepId(toStepId);
            group.setOrderIndex(orderByTarget.merge(toStepId, 1, Integer::sum) - 1);
            coFireGroupRepository.save(group);
            for (WorkflowTransition m : members) {
                m.setCoFireGroupId(group.getId());
                transitionRepository.save(m);
            }
        }
    }

    private Long requireRefId(String ref, Map<String, Long> refToId, String context) {
        String key = ref == null ? null : ref.trim();
        Long id = key == null ? null : refToId.get(key);
        if (id == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, context + " references an unknown step: " + ref);
        }
        return id;
    }

    // ---------------- Export ----------------

    /**
     * Serialises a workflow into the same JSON shape accepted by import, so it round-trips.
     * Steps/phases are keyed by stable id-derived refs (s&lt;id&gt; / p&lt;id&gt;), which lets a later
     * update-import match them back to the existing rows. Phases are omitted unless requested.
     */
    @Transactional(readOnly = true)
    public ImportWorkflowRequest exportWorkflow(Long id, boolean includePhases, boolean includeReviews) {
        Workflow workflow = workflowService.requireWorkflow(id);
        List<WorkflowStep> steps = stepRepository.findByWorkflowIdOrderByOrderIndexAsc(id);
        Map<Long, BusinessRole> roles = roleRepository.findAll().stream()
                .collect(Collectors.toMap(BusinessRole::getId, Function.identity()));
        Map<Long, WorkflowPhase> phasesById = phaseRepository.findByWorkflowIdOrderByOrderIndexAsc(id).stream()
                .collect(Collectors.toMap(WorkflowPhase::getId, Function.identity()));
        Map<Long, List<StepReview>> reviewsByStep = includeReviews
                ? reviewRepository.findByStepIdInOrderByCreatedAtDescIdDesc(
                        steps.stream().map(WorkflowStep::getId).toList()).stream()
                        .collect(Collectors.groupingBy(StepReview::getStepId))
                : Map.of();
        Map<Long, List<WorkflowStep>> byParent = steps.stream()
                .collect(Collectors.groupingBy(s -> s.getParentId() == null ? 0L : s.getParentId()));
        List<ImportStepNode> stepNodes = exportStepNodes(0L, byParent, roles, phasesById, includePhases, reviewsByStep);

        List<Long> stepIds = steps.stream().map(WorkflowStep::getId).toList();
        Map<Long, TransitionGroup> groups = transitionGroupRepository.findAll().stream()
                .collect(Collectors.toMap(TransitionGroup::getId, Function.identity()));
        List<ImportTransition> transitions = transitionRepository.findAll().stream()
                .filter(t -> stepIds.contains(t.getFromStepId()))
                .sorted(Comparator.comparingInt(WorkflowTransition::getOrderIndex))
                .map(t -> {
                    TransitionGroup g = t.getGroupId() == null ? null : groups.get(t.getGroupId());
                    return new ImportTransition(stepRef(t.getFromStepId()), stepRef(t.getToStepId()),
                            g == null ? null : g.getLabel(),
                            t.getCoFireGroupId() == null ? null : "cf" + t.getCoFireGroupId());
                })
                .toList();

        List<ImportPhaseNode> phaseNodes = null;
        if (includePhases) {
            phaseNodes = phaseRepository.findByWorkflowIdOrderByOrderIndexAsc(id).stream()
                    .map(p -> new ImportPhaseNode(phaseRef(p.getId()), p.getName(), p.getColor(),
                            p.getOrderIndex(), p.getDescription()))
                    .toList();
        }
        List<String> tagNames = workflow.getTags().isEmpty() ? null
                : workflow.getTags().stream()
                        .sorted(String.CASE_INSENSITIVE_ORDER)
                        .toList();
        return new ImportWorkflowRequest(workflow.getName(), workflow.getDescription(),
                workflow.getStatus().name(),
                workflow.getConfidence() == 0 ? null : workflow.getConfidence(),
                tagNames,
                phaseNodes, stepNodes, transitions);
    }

    /**
     * Exports many workflows into one bundle. An empty/null id list means "all current-version
     * workflows". Reuses {@link #exportWorkflow} per id, so each entry round-trips through import.
     */
    @Transactional(readOnly = true)
    public WorkflowBundle exportBundle(List<Long> ids, boolean includePhases, boolean includeReviews) {
        List<Long> targetIds = (ids == null || ids.isEmpty())
                ? workflowRepository.findByOwnerIdAndIsCurrentTrueOrderByOrderIndexAsc(currentUser.requireUserId()).stream()
                        .map(Workflow::getId).toList()
                : ids;
        List<ImportWorkflowRequest> exported = new ArrayList<>();
        for (Long id : targetIds) {
            exported.add(exportWorkflow(id, includePhases, includeReviews));
        }
        return new WorkflowBundle(WorkflowBundle.FORMAT, WorkflowBundle.FORMAT_VERSION,
                Instant.now().toString(), exported.size(), exported);
    }

    private List<ImportStepNode> exportStepNodes(Long parentKey, Map<Long, List<WorkflowStep>> byParent,
                                                 Map<Long, BusinessRole> roles,
                                                 Map<Long, WorkflowPhase> phasesById, boolean includePhases,
                                                 Map<Long, List<StepReview>> reviewsByStep) {
        return byParent.getOrDefault(parentKey, List.of()).stream()
                .sorted(Comparator.comparingInt(WorkflowStep::getOrderIndex))
                .map(step -> {
                    List<String> roleNames = step.getBusinessRoleIds().stream()
                            .map(roles::get).filter(Objects::nonNull).map(BusinessRole::getName).toList();
                    String phaseRef = null;
                    if (includePhases && step.getPhaseId() != null && phasesById.containsKey(step.getPhaseId())) {
                        phaseRef = phaseRef(step.getPhaseId());
                    }
                    List<ImportReviewNode> reviewNodes = reviewsByStep.getOrDefault(step.getId(), List.of()).stream()
                            .map(r -> new ImportReviewNode(r.getContent(), r.getCreatedAt()))
                            .toList();
                    List<ImportStepNode> children = exportStepNodes(step.getId(), byParent, roles, phasesById, includePhases, reviewsByStep);
                    return new ImportStepNode(stepRef(step.getId()), step.getLineageKey(), step.getName(), step.getDescription(),
                            step.getNotes(), null, roleNames.isEmpty() ? null : roleNames, phaseRef,
                            reviewNodes.isEmpty() ? null : reviewNodes,
                            children.isEmpty() ? null : children);
                })
                .toList();
    }

    private String stepRef(Long stepId) {
        return "s" + stepId;
    }

    private String phaseRef(Long phaseId) {
        return "p" + phaseId;
    }

    // ---------------- Update from import ----------------

    /**
     * Updates an existing workflow in place from an imported JSON. Steps are upserted by ref
     * (id-derived refs match existing rows, unknown refs become new steps, existing rows absent
     * from the JSON are removed). Phases self-adapt: when the JSON carries no phases, existing
     * phases are kept, matched steps retain their phase and new steps inherit their parent's phase.
     */
    @Transactional
    public WorkflowDto updateWorkflowFromImport(Long id, ImportWorkflowRequest request) {
        Workflow workflow = workflowService.requireWorkflow(id);
        String name = request.name() == null ? null : request.name().trim();
        if (name == null || name.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Workflow name is required");
        }
        if (workflowRepository.existsByNameIgnoreCaseAndOwnerIdAndGroupIdNot(name, workflow.getOwnerId(), workflow.getGroupId())) {
            throw new ApiException(HttpStatus.CONFLICT, "Workflow name already exists");
        }

        Map<Long, WorkflowStep> existingById = stepRepository.findByWorkflowIdOrderByOrderIndexAsc(id).stream()
                .collect(Collectors.toMap(WorkflowStep::getId, Function.identity(), (a, b) -> a, LinkedHashMap::new));

        boolean hasPhases = request.phases() != null && !request.phases().isEmpty();
        Map<String, Long> phaseRefToId = hasPhases ? reconcilePhases(request.phases(), id) : new LinkedHashMap<>();
        Map<String, Long> existingPhaseByName = phaseRepository.findByWorkflowIdOrderByOrderIndexAsc(id).stream()
                .collect(Collectors.toMap(p -> p.getName().toLowerCase(), WorkflowPhase::getId, (a, b) -> a));

        // Drop this workflow's transitions up front; they are fully re-created from the JSON below.
        List<Long> existingIds = new ArrayList<>(existingById.keySet());
        List<WorkflowTransition> obsolete = transitionRepository.findAll().stream()
                .filter(t -> existingIds.contains(t.getFromStepId()) || existingIds.contains(t.getToStepId()))
                .toList();
        List<Long> obsoleteCoFire = obsolete.stream().map(WorkflowTransition::getCoFireGroupId)
                .filter(java.util.Objects::nonNull).distinct().toList();
        transitionRepository.deleteAll(obsolete);
        coFireGroupRepository.deleteAllById(obsoleteCoFire);

        UpdateImportContext ctx = new UpdateImportContext(id, existingById, phaseRefToId,
                existingPhaseByName, hasPhases, workflow.getOwnerId());
        upsertSteps(request.steps(), null, null, ctx);

        // Remove steps that vanished from the JSON, unless an artifact currently sits on one.
        List<Long> toDelete = existingIds.stream().filter(sid -> !ctx.seen.contains(sid)).toList();
        for (Long sid : toDelete) {
            long onStep = artifactRepository.countByCurrentStepId(sid);
            if (onStep > 0) {
                throw new ApiException(HttpStatus.CONFLICT, "Cannot remove step '"
                        + existingById.get(sid).getName() + "' because " + onStep
                        + " artifact(s) are currently on it");
            }
        }
        if (!toDelete.isEmpty()) {
            reviewRepository.deleteByStepIdIn(toDelete);
            stepRepository.deleteAllById(toDelete);
        }

        importTransitions(request.transitions(), ctx.refToId);

        workflow.setName(name);
        workflow.setDescription(request.description());
        if (request.status() != null) {
            workflow.setStatus(workflowService.parseStatus(request.status()));
        }
        if (request.tags() != null) {
            workflow.setTags(workflowService.cleanTags(request.tags()));
        }
        if (request.confidence() != null) {
            workflow.setConfidence(WorkflowService.clampConfidence(request.confidence()));
        }
        return workflowService.toWorkflowDto(workflowRepository.save(workflow));
    }

    /** Mutable state threaded through the recursive step upsert during an update-import. */
    private static final class UpdateImportContext {
        final Long workflowId;
        final Map<Long, WorkflowStep> existingById;
        final Map<String, Long> phaseRefToId;
        final Map<String, Long> existingPhaseByName;
        final boolean hasPhases;
        final Long ownerId;
        final Map<String, Long> refToId = new LinkedHashMap<>();
        final Set<Long> seen = new HashSet<>();
        final Map<String, BusinessRole> roleCache = new HashMap<>();

        UpdateImportContext(Long workflowId, Map<Long, WorkflowStep> existingById,
                            Map<String, Long> phaseRefToId, Map<String, Long> existingPhaseByName,
                            boolean hasPhases, Long ownerId) {
            this.workflowId = workflowId;
            this.existingById = existingById;
            this.phaseRefToId = phaseRefToId;
            this.existingPhaseByName = existingPhaseByName;
            this.hasPhases = hasPhases;
            this.ownerId = ownerId;
        }
    }

    private void upsertSteps(List<ImportStepNode> nodes, Long parentId, Long parentPhaseId, UpdateImportContext ctx) {
        if (nodes == null) {
            return;
        }
        int order = 0;
        for (ImportStepNode node : nodes) {
            String ref = node.ref() == null ? null : node.ref().trim();
            if (ref == null || ref.isEmpty()) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "Every step needs a non-empty 'ref'");
            }
            if (ctx.refToId.containsKey(ref)) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "Duplicate step ref: " + ref);
            }
            if (node.name() == null || node.name().isBlank()) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "Step '" + ref + "' is missing a name");
            }
            Long matchedId = matchExistingStep(ref, ctx.existingById);
            WorkflowStep step;
            boolean isNew;
            if (matchedId != null) {
                step = ctx.existingById.get(matchedId);
                isNew = false;
                ctx.seen.add(matchedId);
            } else {
                step = new WorkflowStep();
                step.setWorkflowId(ctx.workflowId);
                step.setLineageKey(node.lineageKey());
                isNew = true;
            }
            step.setParentId(parentId);
            step.setName(node.name().trim());
            step.setDescription(node.description());
            step.setNotes(node.notes());
            step.setBusinessRoleIds(resolveRoles(node.roles(), node.role(), ctx.roleCache, ctx.ownerId));
            Long phaseId = resolvePhaseForUpdate(node, isNew, step, parentPhaseId, ctx);
            step.setPhaseId(phaseId);
            step.setOrderIndex(order++);
            stepRepository.save(step);
            replaceReviewsOnUpdate(step.getId(), node.reviews());
            ctx.refToId.put(ref, step.getId());
            upsertSteps(node.children(), step.getId(), phaseId, ctx);
        }
    }

    /** Resolves a step {@code ref} back to an existing row id, accepting {@code s<id>} or a bare numeric id. */
    private Long matchExistingStep(String ref, Map<Long, WorkflowStep> existingById) {
        Long candidate = parseIdRef(ref, 's');
        if (candidate == null) {
            candidate = parseIdRef(ref, null);
        }
        return candidate != null && existingById.containsKey(candidate) ? candidate : null;
    }

    private Long parseIdRef(String ref, Character prefix) {
        try {
            if (prefix == null) {
                return Long.parseLong(ref);
            }
            if (ref.length() > 1 && ref.charAt(0) == prefix) {
                return Long.parseLong(ref.substring(1));
            }
        } catch (NumberFormatException ignored) {
            // Not an id-derived ref; treat as a new/opaque key.
        }
        return null;
    }

    private Long resolvePhaseForUpdate(ImportStepNode node, boolean isNew, WorkflowStep step,
                                       Long parentPhaseId, UpdateImportContext ctx) {
        String phaseRef = node.phase() == null ? null : node.phase().trim();
        if (phaseRef != null && !phaseRef.isEmpty()) {
            Long pid = ctx.phaseRefToId.get(phaseRef);
            if (pid == null) {
                pid = ctx.existingPhaseByName.get(phaseRef.toLowerCase());
            }
            if (pid != null) {
                return pid;
            }
            if (ctx.hasPhases) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "Step references an unknown phase: " + node.phase());
            }
            // Adaptation mode with an unresolved phase name: fall through to the adaptive default.
        }
        if (!isNew) {
            return step.getPhaseId();
        }
        return parentPhaseId;
    }

    /** Upserts imported phases (match by id-derived ref or name), keeping any existing phases not listed. */
    private Map<String, Long> reconcilePhases(List<ImportPhaseNode> phases, Long workflowId) {
        Map<String, Long> refToId = new LinkedHashMap<>();
        List<WorkflowPhase> existing = phaseRepository.findByWorkflowIdOrderByOrderIndexAsc(workflowId);
        Map<Long, WorkflowPhase> byId = existing.stream()
                .collect(Collectors.toMap(WorkflowPhase::getId, Function.identity()));
        Map<String, WorkflowPhase> byName = existing.stream()
                .collect(Collectors.toMap(p -> p.getName().toLowerCase(), Function.identity(), (a, b) -> a));
        int order = 0;
        for (ImportPhaseNode node : phases) {
            if (node.name() == null || node.name().isBlank()) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "Every phase needs a name");
            }
            String phaseName = node.name().trim();
            String ref = node.ref() == null ? null : node.ref().trim();
            WorkflowPhase phase = null;
            if (ref != null) {
                Long pid = parseIdRef(ref, 'p');
                if (pid != null) {
                    phase = byId.get(pid);
                }
            }
            if (phase == null) {
                phase = byName.get(phaseName.toLowerCase());
            }
            if (phase == null) {
                phase = new WorkflowPhase();
                phase.setWorkflowId(workflowId);
            }
            phase.setName(phaseName);
            phase.setColor(node.color());
            phase.setDescription(node.description());
            phase.setOrderIndex(node.orderIndex() != null ? node.orderIndex() : order);
            phaseRepository.save(phase);
            if (ref != null && !ref.isEmpty()) {
                refToId.put(ref, phase.getId());
            }
            refToId.putIfAbsent(phaseName, phase.getId());
            order++;
        }
        return refToId;
    }

    /** Resolves a role by name (case-insensitive) within the owner's roles, auto-creating it when missing. */
    private Long resolveRole(String roleName, Map<String, BusinessRole> cache, Long ownerId) {
        if (roleName == null || roleName.isBlank()) {
            return null;
        }
        String key = roleName.trim().toLowerCase();
        BusinessRole role = cache.computeIfAbsent(key, k ->
                roleRepository.findFirstByOwnerIdAndNameIgnoreCase(ownerId, roleName.trim()).orElseGet(() -> {
                    BusinessRole created = new BusinessRole();
                    created.setOwnerId(ownerId);
                    created.setName(roleName.trim());
                    return roleRepository.save(created);
                }));
        return role.getId();
    }

    /** Merges the legacy singular {@code role} with the {@code roles} list, resolving each by name (deduped, order-preserving). */
    private List<Long> resolveRoles(List<String> names, String single, Map<String, BusinessRole> cache, Long ownerId) {
        LinkedHashSet<Long> ids = new LinkedHashSet<>();
        Long fromSingle = resolveRole(single, cache, ownerId);
        if (fromSingle != null) {
            ids.add(fromSingle);
        }
        if (names != null) {
            for (String name : names) {
                Long id = resolveRole(name, cache, ownerId);
                if (id != null) {
                    ids.add(id);
                }
            }
        }
        return new ArrayList<>(ids);
    }
}
