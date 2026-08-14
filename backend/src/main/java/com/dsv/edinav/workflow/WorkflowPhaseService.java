package com.dsv.edinav.workflow;

import com.dsv.edinav.common.ApiException;
import com.dsv.edinav.security.CurrentUserService;
import com.dsv.edinav.workflow.dto.WorkflowPhaseDto;
import com.dsv.edinav.workflow.dto.WorkflowPhaseRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/** CRUD for workflow phases. Phase validation and import reconciliation live in {@link WorkflowService}. */
@Service
public class WorkflowPhaseService {

    private final WorkflowPhaseRepository phaseRepository;
    private final WorkflowStepRepository stepRepository;
    private final WorkflowRepository workflowRepository;
    private final CurrentUserService currentUser;

    public WorkflowPhaseService(WorkflowPhaseRepository phaseRepository, WorkflowStepRepository stepRepository,
                                WorkflowRepository workflowRepository, CurrentUserService currentUser) {
        this.phaseRepository = phaseRepository;
        this.stepRepository = stepRepository;
        this.workflowRepository = workflowRepository;
        this.currentUser = currentUser;
    }

    @Transactional(readOnly = true)
    public List<WorkflowPhaseDto> getPhases(Long workflowId) {
        requireWorkflow(workflowId);
        return phaseRepository.findByWorkflowIdOrderByOrderIndexAsc(workflowId).stream()
                .map(WorkflowMapper::toPhaseDto).toList();
    }

    @Transactional
    public WorkflowPhaseDto createPhase(Long workflowId, WorkflowPhaseRequest request) {
        requireWorkflow(workflowId);
        if (phaseRepository.existsByWorkflowIdAndNameIgnoreCase(workflowId, request.name().trim())) {
            throw new ApiException(HttpStatus.CONFLICT, "Phase name already exists in this workflow");
        }
        WorkflowPhase phase = new WorkflowPhase();
        phase.setWorkflowId(workflowId);
        phase.setName(request.name().trim());
        phase.setColor(request.color());
        phase.setDescription(request.description());
        phase.setOrderIndex(request.orderIndex() != null ? request.orderIndex()
                : phaseRepository.nextOrderIndex(workflowId));
        return WorkflowMapper.toPhaseDto(phaseRepository.save(phase));
    }

    @Transactional
    public WorkflowPhaseDto updatePhase(Long id, WorkflowPhaseRequest request) {
        WorkflowPhase phase = phaseRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Phase not found"));
        requireWorkflow(phase.getWorkflowId());
        phase.setName(request.name().trim());
        phase.setColor(request.color());
        phase.setDescription(request.description());
        if (request.orderIndex() != null) {
            phase.setOrderIndex(request.orderIndex());
        }
        return WorkflowMapper.toPhaseDto(phaseRepository.save(phase));
    }

    @Transactional
    public void deletePhase(Long id) {
        WorkflowPhase phase = phaseRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Phase not found"));
        requireWorkflow(phase.getWorkflowId());
        // Detach the phase from any steps that reference it, then delete (never cascade-delete steps).
        stepRepository.findByPhaseIdOrderByOrderIndexAsc(id).forEach(step -> {
            step.setPhaseId(null);
            stepRepository.save(step);
        });
        phaseRepository.deleteById(id);
    }

    private void requireWorkflow(Long id) {
        Workflow workflow = workflowRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Workflow not found"));
        if (!workflow.getOwnerId().equals(currentUser.requireUserId())) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Workflow not found");
        }
    }
}
