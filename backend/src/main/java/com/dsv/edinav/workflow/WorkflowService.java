package com.dsv.edinav.workflow;

import com.dsv.edinav.common.ApiException;
import com.dsv.edinav.artifact.ArtifactRepository;
import com.dsv.edinav.workflow.dto.BusinessRoleDto;
import com.dsv.edinav.workflow.dto.CreateStepRequest;
import com.dsv.edinav.workflow.dto.CreateTransitionRequest;
import com.dsv.edinav.workflow.dto.CreateVersionRequest;
import com.dsv.edinav.workflow.dto.ImportPhaseNode;
import com.dsv.edinav.workflow.dto.ImportStepNode;
import com.dsv.edinav.workflow.dto.ImportTransition;
import com.dsv.edinav.workflow.dto.ImportWorkflowRequest;
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
import java.util.Comparator;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
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
    private Workflow saveAsNewGroup(Workflow workflow) {
        workflow.setVersion(1);
        workflow.setCurrent(true);
        Workflow saved = workflowRepository.save(workflow);
        saved.setGroupId(saved.getId());
        return workflowRepository.save(saved);
    }

    @Transactional
    public WorkflowDto importWorkflow(ImportWorkflowRequest request) {
        String name = request.name() == null ? null : request.name().trim();
        if (name == null || name.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Workflow name is required");
        }
        if (workflowRepository.existsByNameIgnoreCase(name)) {
            throw new ApiException(HttpStatus.CONFLICT, "Workflow name already exists");
        }
        Workflow workflow = new Workflow();
        workflow.setName(name);
        workflow.setDescription(request.description());
        workflow.setStatus(request.status() == null ? WorkflowStatus.DRAFT : parseStatus(request.status()));
        workflow.setOrderIndex(workflowRepository.nextOrderIndex());
        workflow.setTags(cleanTags(request.tags()));
        saveAsNewGroup(workflow);
        populateFromImport(workflow, request);
        return toWorkflowDto(workflow);
    }

    /** Creates the phases, step tree and transitions of {@code workflow} from an import payload. */
    private void populateFromImport(Workflow workflow, ImportWorkflowRequest request) {
        Map<String, Long> refToId = new LinkedHashMap<>();
        Map<String, BusinessRole> roleCache = new HashMap<>();
        Map<String, Long> phaseRefToId = importPhases(request.phases(), workflow.getId());
        importSteps(request.steps(), null, workflow.getId(), refToId, roleCache, phaseRefToId);
        importTransitions(request.transitions(), refToId);
    }

    /** Creates a new editable version (deep copy) of a workflow within the same group; not current. */
    @Transactional
    public WorkflowDto createVersion(Long sourceId, CreateVersionRequest request) {
        Workflow source = requireWorkflow(sourceId);
        ImportWorkflowRequest snapshot = exportWorkflow(sourceId, true);
        Workflow version = new Workflow();
        version.setName(source.getName());
        version.setDescription(source.getDescription());
        version.setStatus(source.getStatus());
        version.setGroupId(source.getGroupId());
        version.setVersion(workflowRepository.nextVersion(source.getGroupId()));
        version.setVersionLabel(request == null ? null : request.label());
        version.setCurrent(false);
        version.setOrderIndex(source.getOrderIndex());
        version.setFolderId(source.getFolderId());
        version.setTags(new ArrayList<>(source.getTags()));
        workflowRepository.save(version);
        populateFromImport(version, snapshot);
        return toWorkflowDto(version);
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

    private void importSteps(List<ImportStepNode> nodes, Long parentId, Long workflowId,
                             Map<String, Long> refToId, Map<String, BusinessRole> roleCache,
                             Map<String, Long> phaseRefToId) {
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
            step.setBusinessRoleIds(resolveRoles(node.roles(), node.role(), roleCache));
            step.setPhaseId(resolveImportedPhase(node.phase(), phaseRefToId));
            step.setOrderIndex(order++);
            stepRepository.save(step);
            refToId.put(ref, step.getId());
            importSteps(node.children(), step.getId(), workflowId, refToId, roleCache, phaseRefToId);
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
        Map<Long, Integer> orderByFrom = new HashMap<>();
        for (ImportTransition t : transitions) {
            Long fromId = requireRefId(t.from(), refToId, "transition 'from'");
            Long toId = requireRefId(t.to(), refToId, "transition 'to'");
            if (fromId.equals(toId)) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "A step cannot transition to itself: " + t.from());
            }
            WorkflowTransition transition = new WorkflowTransition();
            transition.setFromStepId(fromId);
            transition.setToStepId(toId);
            transition.setLabel(t.label());
            transition.setOrderIndex(orderByFrom.merge(fromId, 1, Integer::sum) - 1);
            transitionRepository.save(transition);
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
    public ImportWorkflowRequest exportWorkflow(Long id, boolean includePhases) {
        Workflow workflow = requireWorkflow(id);
        List<WorkflowStep> steps = stepRepository.findByWorkflowIdOrderByOrderIndexAsc(id);
        Map<Long, BusinessRole> roles = roleRepository.findAll().stream()
                .collect(Collectors.toMap(BusinessRole::getId, Function.identity()));
        Map<Long, WorkflowPhase> phasesById = phaseRepository.findByWorkflowIdOrderByOrderIndexAsc(id).stream()
                .collect(Collectors.toMap(WorkflowPhase::getId, Function.identity()));
        Map<Long, List<WorkflowStep>> byParent = steps.stream()
                .collect(Collectors.groupingBy(s -> s.getParentId() == null ? 0L : s.getParentId()));
        List<ImportStepNode> stepNodes = exportStepNodes(0L, byParent, roles, phasesById, includePhases);

        List<Long> stepIds = steps.stream().map(WorkflowStep::getId).toList();
        List<ImportTransition> transitions = transitionRepository.findAll().stream()
                .filter(t -> stepIds.contains(t.getFromStepId()))
                .sorted(Comparator.comparingInt(WorkflowTransition::getOrderIndex))
                .map(t -> new ImportTransition(stepRef(t.getFromStepId()), stepRef(t.getToStepId()), t.getLabel()))
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
                workflow.getStatus().name(), tagNames,
                phaseNodes, stepNodes, transitions);
    }

    private List<ImportStepNode> exportStepNodes(Long parentKey, Map<Long, List<WorkflowStep>> byParent,
                                                 Map<Long, BusinessRole> roles,
                                                 Map<Long, WorkflowPhase> phasesById, boolean includePhases) {
        return byParent.getOrDefault(parentKey, List.of()).stream()
                .sorted(Comparator.comparingInt(WorkflowStep::getOrderIndex))
                .map(step -> {
                    List<String> roleNames = step.getBusinessRoleIds().stream()
                            .map(roles::get).filter(Objects::nonNull).map(BusinessRole::getName).toList();
                    String phaseRef = null;
                    if (includePhases && step.getPhaseId() != null && phasesById.containsKey(step.getPhaseId())) {
                        phaseRef = phaseRef(step.getPhaseId());
                    }
                    List<ImportStepNode> children = exportStepNodes(step.getId(), byParent, roles, phasesById, includePhases);
                    return new ImportStepNode(stepRef(step.getId()), step.getLineageKey(), step.getName(), step.getDescription(),
                            step.getNotes(), null, roleNames.isEmpty() ? null : roleNames, phaseRef,
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
        Workflow workflow = requireWorkflow(id);
        String name = request.name() == null ? null : request.name().trim();
        if (name == null || name.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Workflow name is required");
        }
        if (workflowRepository.existsByNameIgnoreCaseAndGroupIdNot(name, workflow.getGroupId())) {
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
        transitionRepository.findAll().stream()
                .filter(t -> existingIds.contains(t.getFromStepId()) || existingIds.contains(t.getToStepId()))
                .forEach(transitionRepository::delete);

        UpdateImportContext ctx = new UpdateImportContext(id, existingById, phaseRefToId,
                existingPhaseByName, hasPhases);
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
            stepRepository.deleteAllById(toDelete);
        }

        importTransitions(request.transitions(), ctx.refToId);

        workflow.setName(name);
        workflow.setDescription(request.description());
        if (request.status() != null) {
            workflow.setStatus(parseStatus(request.status()));
        }
        if (request.tags() != null) {
            workflow.setTags(cleanTags(request.tags()));
        }
        return toWorkflowDto(workflowRepository.save(workflow));
    }

    /** Mutable state threaded through the recursive step upsert during an update-import. */
    private static final class UpdateImportContext {
        final Long workflowId;
        final Map<Long, WorkflowStep> existingById;
        final Map<String, Long> phaseRefToId;
        final Map<String, Long> existingPhaseByName;
        final boolean hasPhases;
        final Map<String, Long> refToId = new LinkedHashMap<>();
        final Set<Long> seen = new HashSet<>();
        final Map<String, BusinessRole> roleCache = new HashMap<>();

        UpdateImportContext(Long workflowId, Map<Long, WorkflowStep> existingById,
                            Map<String, Long> phaseRefToId, Map<String, Long> existingPhaseByName,
                            boolean hasPhases) {
            this.workflowId = workflowId;
            this.existingById = existingById;
            this.phaseRefToId = phaseRefToId;
            this.existingPhaseByName = existingPhaseByName;
            this.hasPhases = hasPhases;
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
            step.setBusinessRoleIds(resolveRoles(node.roles(), node.role(), ctx.roleCache));
            Long phaseId = resolvePhaseForUpdate(node, isNew, step, parentPhaseId, ctx);
            step.setPhaseId(phaseId);
            step.setOrderIndex(order++);
            stepRepository.save(step);
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

    /** Resolves a role by name (case-insensitive), auto-creating it when missing. */
    private Long resolveRole(String roleName, Map<String, BusinessRole> cache) {
        if (roleName == null || roleName.isBlank()) {
            return null;
        }
        String key = roleName.trim().toLowerCase();
        BusinessRole role = cache.computeIfAbsent(key, k ->
                roleRepository.findFirstByNameIgnoreCase(roleName.trim()).orElseGet(() -> {
                    BusinessRole created = new BusinessRole();
                    created.setName(roleName.trim());
                    return roleRepository.save(created);
                }));
        return role.getId();
    }

    /** Merges the legacy singular {@code role} with the {@code roles} list, resolving each by name (deduped, order-preserving). */
    private List<Long> resolveRoles(List<String> names, String single, Map<String, BusinessRole> cache) {
        LinkedHashSet<Long> ids = new LinkedHashSet<>();
        Long fromSingle = resolveRole(single, cache);
        if (fromSingle != null) {
            ids.add(fromSingle);
        }
        if (names != null) {
            for (String name : names) {
                Long id = resolveRole(name, cache);
                if (id != null) {
                    ids.add(id);
                }
            }
        }
        return new ArrayList<>(ids);
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

    private Workflow requireWorkflow(Long id) {
        return workflowRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Workflow not found"));
    }

    private WorkflowDto toWorkflowDto(Workflow w) {
        List<String> tags = w.getTags().stream()
                .sorted(String.CASE_INSENSITIVE_ORDER)
                .toList();
        return new WorkflowDto(w.getId(), w.getName(), w.getDescription(),
                w.getStatus().name(), w.getGroupId(), w.getVersion(),
                w.getVersionLabel(), w.isCurrent(), w.getOrderIndex(),
                w.getFolderId(),
                stepRepository.countByWorkflowId(w.getId()), tags);
    }

    private WorkflowStatus parseStatus(String value) {
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
    private List<String> cleanTags(List<String> tags) {
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
