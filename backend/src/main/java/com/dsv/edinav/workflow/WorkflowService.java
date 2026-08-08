package com.dsv.edinav.workflow;

import com.dsv.edinav.common.ApiException;
import com.dsv.edinav.workflow.dto.AddMemberRequest;
import com.dsv.edinav.workflow.dto.BusinessRoleDto;
import com.dsv.edinav.workflow.dto.BusinessRoleRequest;
import com.dsv.edinav.workflow.dto.CompositeMemberDto;
import com.dsv.edinav.workflow.dto.CreateStepRequest;
import com.dsv.edinav.workflow.dto.CreateTransitionRequest;
import com.dsv.edinav.workflow.dto.ImportStepNode;
import com.dsv.edinav.workflow.dto.ImportTransition;
import com.dsv.edinav.workflow.dto.ImportWorkflowRequest;
import com.dsv.edinav.workflow.dto.TransitionDto;
import com.dsv.edinav.workflow.dto.UpdateStepRequest;
import com.dsv.edinav.workflow.dto.WorkflowCompositeDto;
import com.dsv.edinav.workflow.dto.WorkflowDto;
import com.dsv.edinav.workflow.dto.WorkflowLinkDto;
import com.dsv.edinav.workflow.dto.WorkflowLinkRequest;
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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class WorkflowService {

    private final WorkflowRepository workflowRepository;
    private final WorkflowStepRepository stepRepository;
    private final WorkflowTransitionRepository transitionRepository;
    private final BusinessRoleRepository roleRepository;
    private final WorkflowCompositionRepository compositionRepository;
    private final WorkflowLinkRepository linkRepository;

    public WorkflowService(WorkflowRepository workflowRepository,
                           WorkflowStepRepository stepRepository,
                           WorkflowTransitionRepository transitionRepository,
                           BusinessRoleRepository roleRepository,
                           WorkflowCompositionRepository compositionRepository,
                           WorkflowLinkRepository linkRepository) {
        this.workflowRepository = workflowRepository;
        this.stepRepository = stepRepository;
        this.transitionRepository = transitionRepository;
        this.roleRepository = roleRepository;
        this.compositionRepository = compositionRepository;
        this.linkRepository = linkRepository;
    }

    // ---------------- Workflows (containers) ----------------

    @Transactional(readOnly = true)
    public List<WorkflowDto> getWorkflows(String type, String status) {
        List<Workflow> workflows;
        WorkflowType t = type == null ? null : parseType(type);
        WorkflowStatus s = status == null ? null : parseStatus(status);
        if (t != null && s != null) {
            workflows = workflowRepository.findByTypeAndStatusOrderByOrderIndexAsc(t, s);
        } else if (t != null) {
            workflows = workflowRepository.findByTypeOrderByOrderIndexAsc(t);
        } else {
            workflows = workflowRepository.findAllByOrderByOrderIndexAsc();
        }
        return workflows.stream().map(this::toWorkflowDto).toList();
    }

    @Transactional(readOnly = true)
    public WorkflowDto getWorkflow(Long id) {
        return toWorkflowDto(requireWorkflow(id));
    }

    @Transactional
    public WorkflowDto createWorkflow(WorkflowRequest request) {
        if (workflowRepository.existsByNameIgnoreCase(request.name().trim())) {
            throw new ApiException(HttpStatus.CONFLICT, "Workflow name already exists");
        }
        Workflow workflow = new Workflow();
        workflow.setName(request.name().trim());
        workflow.setDescription(request.description());
        workflow.setType(request.type() == null ? WorkflowType.SUB : parseType(request.type()));
        workflow.setStatus(request.status() == null ? WorkflowStatus.DRAFT : parseStatus(request.status()));
        workflow.setEntryStepId(request.entryStepId());
        workflow.setOrderIndex(workflowRepository.nextOrderIndex());
        return toWorkflowDto(workflowRepository.save(workflow));
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
        WorkflowType type = request.type() == null ? WorkflowType.SUB : parseType(request.type());
        if (type == WorkflowType.MASTER) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Importing MASTER workflows is not supported yet");
        }

        Workflow workflow = new Workflow();
        workflow.setName(name);
        workflow.setDescription(request.description());
        workflow.setType(type);
        workflow.setStatus(request.status() == null ? WorkflowStatus.DRAFT : parseStatus(request.status()));
        workflow.setOrderIndex(workflowRepository.nextOrderIndex());
        workflowRepository.save(workflow);

        Map<String, Long> refToId = new LinkedHashMap<>();
        Map<String, BusinessRole> roleCache = new HashMap<>();
        importSteps(request.steps(), null, workflow.getId(), refToId, roleCache);
        importTransitions(request.transitions(), refToId);

        if (request.entryStepRef() != null && !request.entryStepRef().isBlank()) {
            Long entryId = refToId.get(request.entryStepRef().trim());
            if (entryId == null) {
                throw new ApiException(HttpStatus.BAD_REQUEST,
                        "entryStepRef references an unknown step: " + request.entryStepRef());
            }
            workflow.setEntryStepId(entryId);
            workflowRepository.save(workflow);
        }
        return toWorkflowDto(workflow);
    }

    private void importSteps(List<ImportStepNode> nodes, Long parentId, Long workflowId,
                             Map<String, Long> refToId, Map<String, BusinessRole> roleCache) {
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
            step.setBusinessRoleId(resolveRole(node.role(), roleCache));
            step.setOrderIndex(order++);
            stepRepository.save(step);
            refToId.put(ref, step.getId());
            importSteps(node.children(), step.getId(), workflowId, refToId, roleCache);
        }
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

    @Transactional
    public WorkflowDto updateWorkflow(Long id, WorkflowRequest request) {
        Workflow workflow = requireWorkflow(id);
        workflow.setName(request.name().trim());
        workflow.setDescription(request.description());
        if (request.type() != null) {
            workflow.setType(parseType(request.type()));
        }
        if (request.status() != null) {
            workflow.setStatus(parseStatus(request.status()));
        }
        workflow.setEntryStepId(request.entryStepId());
        return toWorkflowDto(workflowRepository.save(workflow));
    }

    @Transactional
    public void deleteWorkflow(Long id) {
        requireWorkflow(id);
        List<WorkflowStep> steps = stepRepository.findByWorkflowIdOrderByOrderIndexAsc(id);
        List<Long> stepIds = steps.stream().map(WorkflowStep::getId).toList();
        transitionRepository.findAll().stream()
                .filter(t -> stepIds.contains(t.getFromStepId()) || stepIds.contains(t.getToStepId()))
                .forEach(transitionRepository::delete);
        // Remove this workflow from any composition it takes part in (as master or piece).
        compositionRepository.deleteByMasterWorkflowId(id);
        compositionRepository.findBySubWorkflowId(id).forEach(compositionRepository::delete);
        linkRepository.deleteByMasterWorkflowId(id);
        linkRepository.findByFromWorkflowIdOrToWorkflowId(id, id).forEach(linkRepository::delete);
        stepRepository.deleteAll(steps);
        workflowRepository.deleteById(id);
    }

    // ---------------- Composition (master jigsaw) ----------------

    @Transactional(readOnly = true)
    public WorkflowCompositeDto getComposite(Long masterId) {
        Workflow master = requireWorkflow(masterId);
        List<CompositeMemberDto> members = compositionRepository
                .findByMasterWorkflowIdOrderByOrderIndexAsc(masterId).stream()
                .map(c -> {
                    Workflow sub = workflowRepository.findById(c.getSubWorkflowId()).orElse(null);
                    if (sub == null) {
                        return null;
                    }
                    return new CompositeMemberDto(toWorkflowDto(sub), getTree(sub.getId()));
                })
                .filter(m -> m != null)
                .toList();
        List<WorkflowLinkDto> links = linkRepository
                .findByMasterWorkflowIdOrderByOrderIndexAsc(masterId).stream()
                .map(this::toLinkDto)
                .toList();
        return new WorkflowCompositeDto(toWorkflowDto(master), members, links);
    }

    @Transactional
    public WorkflowCompositeDto addMember(Long masterId, AddMemberRequest request) {
        requireWorkflow(masterId);
        Workflow sub = requireWorkflow(request.subWorkflowId());
        if (masterId.equals(sub.getId())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "A workflow cannot contain itself");
        }
        if (sub.getType() == WorkflowType.MASTER) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Only sub-workflows can be placed on a master");
        }
        if (compositionRepository.existsByMasterWorkflowIdAndSubWorkflowId(masterId, sub.getId())) {
            throw new ApiException(HttpStatus.CONFLICT, "Sub-workflow already placed");
        }
        WorkflowComposition composition = new WorkflowComposition();
        composition.setMasterWorkflowId(masterId);
        composition.setSubWorkflowId(sub.getId());
        composition.setOrderIndex(compositionRepository.nextOrderIndex(masterId));
        compositionRepository.save(composition);
        return getComposite(masterId);
    }

    @Transactional
    public WorkflowCompositeDto removeMember(Long masterId, Long subId) {
        requireWorkflow(masterId);
        if (!compositionRepository.existsByMasterWorkflowIdAndSubWorkflowId(masterId, subId)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Sub-workflow is not part of this master");
        }
        compositionRepository.deleteByMasterWorkflowIdAndSubWorkflowId(masterId, subId);
        linkRepository.findByMasterWorkflowIdOrderByOrderIndexAsc(masterId).stream()
                .filter(l -> subId.equals(l.getFromWorkflowId()) || subId.equals(l.getToWorkflowId()))
                .forEach(linkRepository::delete);
        return getComposite(masterId);
    }

    @Transactional
    public WorkflowLinkDto createLink(WorkflowLinkRequest request) {
        requireWorkflow(request.masterWorkflowId());
        requireMember(request.masterWorkflowId(), request.fromWorkflowId());
        requireMember(request.masterWorkflowId(), request.toWorkflowId());
        validateLinkStep(request.fromWorkflowId(), request.fromExitStepId());
        validateLinkStep(request.toWorkflowId(), request.toEntryStepId());
        WorkflowLink link = new WorkflowLink();
        link.setMasterWorkflowId(request.masterWorkflowId());
        link.setFromWorkflowId(request.fromWorkflowId());
        link.setFromExitStepId(request.fromExitStepId());
        link.setToWorkflowId(request.toWorkflowId());
        link.setToEntryStepId(request.toEntryStepId());
        link.setLabel(request.label());
        link.setOrderIndex(linkRepository.nextOrderIndex(request.masterWorkflowId()));
        return toLinkDto(linkRepository.save(link));
    }

    @Transactional
    public void deleteLink(Long id) {
        if (!linkRepository.existsById(id)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Link not found");
        }
        linkRepository.deleteById(id);
    }

    private void requireMember(Long masterId, Long subId) {
        if (!compositionRepository.existsByMasterWorkflowIdAndSubWorkflowId(masterId, subId)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Workflow is not placed on this master");
        }
    }

    private void validateLinkStep(Long workflowId, Long stepId) {
        if (stepId == null) {
            return;
        }
        WorkflowStep step = stepRepository.findById(stepId)
                .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "Step not found"));
        if (!workflowId.equals(step.getWorkflowId())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Step does not belong to the referenced workflow");
        }
    }

    private WorkflowLinkDto toLinkDto(WorkflowLink link) {
        String fromName = link.getFromExitStepId() == null ? null
                : stepRepository.findById(link.getFromExitStepId()).map(WorkflowStep::getName).orElse(null);
        String toName = link.getToEntryStepId() == null ? null
                : stepRepository.findById(link.getToEntryStepId()).map(WorkflowStep::getName).orElse(null);
        return new WorkflowLinkDto(link.getId(), link.getMasterWorkflowId(),
                link.getFromWorkflowId(), link.getFromExitStepId(), fromName,
                link.getToWorkflowId(), link.getToEntryStepId(), toName,
                link.getLabel(), link.getOrderIndex());
    }

    private Workflow requireWorkflow(Long id) {
        return workflowRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Workflow not found"));
    }

    private WorkflowDto toWorkflowDto(Workflow w) {
        return new WorkflowDto(w.getId(), w.getName(), w.getDescription(), w.getType().name(),
                w.getStatus().name(), w.getEntryStepId(), w.getVersion(), w.getOrderIndex(),
                stepRepository.countByWorkflowId(w.getId()));
    }

    private WorkflowType parseType(String value) {
        try {
            return WorkflowType.valueOf(value.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid workflow type: " + value);
        }
    }

    private WorkflowStatus parseStatus(String value) {
        try {
            return WorkflowStatus.valueOf(value.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid workflow status: " + value);
        }
    }

    // ---------------- Roles ----------------

    @Transactional(readOnly = true)
    public List<BusinessRoleDto> getRoles() {
        return roleRepository.findAllByOrderByNameAsc().stream().map(this::toRoleDto).toList();
    }

    @Transactional
    public BusinessRoleDto createRole(BusinessRoleRequest request) {
        if (roleRepository.existsByNameIgnoreCase(request.name().trim())) {
            throw new ApiException(HttpStatus.CONFLICT, "Role name already exists");
        }
        BusinessRole role = new BusinessRole();
        role.setName(request.name().trim());
        role.setColor(request.color());
        role.setDescription(request.description());
        return toRoleDto(roleRepository.save(role));
    }

    @Transactional
    public BusinessRoleDto updateRole(Long id, BusinessRoleRequest request) {
        BusinessRole role = roleRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Role not found"));
        role.setName(request.name().trim());
        role.setColor(request.color());
        role.setDescription(request.description());
        return toRoleDto(roleRepository.save(role));
    }

    @Transactional
    public void deleteRole(Long id) {
        if (!roleRepository.existsById(id)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Role not found");
        }
        // Detach the role from any steps that reference it, then delete.
        stepRepository.findByBusinessRoleIdOrderByOrderIndexAsc(id).forEach(step -> {
            step.setBusinessRoleId(null);
            stepRepository.save(step);
        });
        roleRepository.deleteById(id);
    }

    // ---------------- Tree ----------------

    @Transactional(readOnly = true)
    public List<WorkflowStepDto> getTree(Long workflowId) {
        requireWorkflow(workflowId);
        List<WorkflowStep> steps = stepRepository.findByWorkflowIdOrderByOrderIndexAsc(workflowId);
        Map<Long, BusinessRole> roles = roleRepository.findAll().stream()
                .collect(Collectors.toMap(BusinessRole::getId, Function.identity()));
        Map<Long, List<WorkflowStep>> byParent = steps.stream()
                .collect(Collectors.groupingBy(s -> s.getParentId() == null ? 0L : s.getParentId()));
        Map<Long, String> stepNames = steps.stream()
                .collect(Collectors.toMap(WorkflowStep::getId, WorkflowStep::getName));
        List<Long> stepIds = steps.stream().map(WorkflowStep::getId).toList();
        Map<Long, List<WorkflowTransition>> byFrom = transitionRepository.findAll().stream()
                .filter(t -> stepIds.contains(t.getFromStepId()))
                .collect(Collectors.groupingBy(WorkflowTransition::getFromStepId));

        return buildChildren(0L, byParent, byFrom, roles, stepNames);
    }

    /** Flat forest of every step across all workflows; used by dashboards and cross-workflow pickers. */
    @Transactional(readOnly = true)
    public List<WorkflowStepDto> getAllSteps() {
        List<WorkflowStep> steps = stepRepository.findAllByOrderByOrderIndexAsc();
        Map<Long, BusinessRole> roles = roleRepository.findAll().stream()
                .collect(Collectors.toMap(BusinessRole::getId, Function.identity()));
        Map<Long, List<WorkflowStep>> byParent = steps.stream()
                .collect(Collectors.groupingBy(s -> s.getParentId() == null ? 0L : s.getParentId()));
        Map<Long, String> stepNames = steps.stream()
                .collect(Collectors.toMap(WorkflowStep::getId, WorkflowStep::getName));
        Map<Long, List<WorkflowTransition>> byFrom = transitionRepository.findAll().stream()
                .collect(Collectors.groupingBy(WorkflowTransition::getFromStepId));
        return buildChildren(0L, byParent, byFrom, roles, stepNames);
    }

    private List<WorkflowStepDto> buildChildren(Long parentKey,
                                                Map<Long, List<WorkflowStep>> byParent,
                                                Map<Long, List<WorkflowTransition>> byFrom,
                                                Map<Long, BusinessRole> roles,
                                                Map<Long, String> stepNames) {
        List<WorkflowStep> children = byParent.getOrDefault(parentKey, List.of()).stream()
                .sorted(Comparator.comparingInt(WorkflowStep::getOrderIndex))
                .toList();
        List<WorkflowStepDto> result = new ArrayList<>();
        for (WorkflowStep step : children) {
            result.add(toStepDto(step, byParent, byFrom, roles, stepNames));
        }
        return result;
    }

    private WorkflowStepDto toStepDto(WorkflowStep step,
                                      Map<Long, List<WorkflowStep>> byParent,
                                      Map<Long, List<WorkflowTransition>> byFrom,
                                      Map<Long, BusinessRole> roles,
                                      Map<Long, String> stepNames) {
        List<WorkflowStepDto> children = buildChildren(step.getId(), byParent, byFrom, roles, stepNames);
        List<TransitionDto> transitions = byFrom.getOrDefault(step.getId(), List.of()).stream()
                .sorted(Comparator.comparingInt(WorkflowTransition::getOrderIndex))
                .map(t -> new TransitionDto(t.getId(), t.getFromStepId(), t.getToStepId(),
                        stepNames.get(t.getToStepId()), t.getLabel(), t.getOrderIndex()))
                .toList();
        BusinessRole role = step.getBusinessRoleId() == null ? null : roles.get(step.getBusinessRoleId());
        return new WorkflowStepDto(step.getId(), step.getWorkflowId(), step.getParentId(), step.getOrderIndex(),
                step.getName(), step.getDescription(), step.getNotes(),
                role == null ? null : toRoleDto(role), children, transitions);
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
        validateRole(request.businessRoleId());
        WorkflowStep step = new WorkflowStep();
        step.setWorkflowId(workflowId);
        step.setParentId(request.parentId());
        step.setName(request.name().trim());
        step.setDescription(request.description());
        step.setNotes(request.notes());
        step.setBusinessRoleId(request.businessRoleId());
        step.setOrderIndex(stepRepository.nextOrderIndex(request.parentId()));
        stepRepository.save(step);
        return getTreeNode(step.getId());
    }

    @Transactional
    public WorkflowStepDto updateStep(Long id, UpdateStepRequest request) {
        WorkflowStep step = stepRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Step not found"));
        validateRole(request.businessRoleId());
        step.setName(request.name().trim());
        step.setDescription(request.description());
        step.setNotes(request.notes());
        step.setBusinessRoleId(request.businessRoleId());
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
        BusinessRole role = roleRepository.findById(roleId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Role not found"));
        BusinessRoleDto roleDto = toRoleDto(role);
        return stepRepository.findByBusinessRoleIdOrderByOrderIndexAsc(roleId).stream()
                .map(step -> new WorkflowStepDto(step.getId(), step.getWorkflowId(), step.getParentId(), step.getOrderIndex(),
                        step.getName(), step.getDescription(), step.getNotes(), roleDto,
                        List.of(), List.of()))
                .toList();
    }

    // ---------------- Helpers ----------------

    private WorkflowStepDto getTreeNode(Long id) {
        WorkflowStep step = stepRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Step not found"));
        Map<Long, BusinessRole> roles = roleRepository.findAll().stream()
                .collect(Collectors.toMap(BusinessRole::getId, Function.identity()));
        Map<Long, List<WorkflowStep>> byParent = stepRepository.findAllByOrderByOrderIndexAsc().stream()
                .collect(Collectors.groupingBy(s -> s.getParentId() == null ? 0L : s.getParentId()));
        Map<Long, String> stepNames = stepRepository.findAllByOrderByOrderIndexAsc().stream()
                .collect(Collectors.toMap(WorkflowStep::getId, WorkflowStep::getName));
        Map<Long, List<WorkflowTransition>> byFrom = transitionRepository.findAll().stream()
                .collect(Collectors.groupingBy(WorkflowTransition::getFromStepId));
        return toStepDto(step, byParent, byFrom, roles, stepNames);
    }

    private void validateRole(Long roleId) {
        if (roleId != null && !roleRepository.existsById(roleId)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Business role not found");
        }
    }

    private BusinessRoleDto toRoleDto(BusinessRole role) {
        return new BusinessRoleDto(role.getId(), role.getName(), role.getColor(), role.getDescription());
    }
}
