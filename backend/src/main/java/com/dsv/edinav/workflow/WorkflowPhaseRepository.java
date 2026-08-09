package com.dsv.edinav.workflow;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface WorkflowPhaseRepository extends JpaRepository<WorkflowPhase, Long> {
    List<WorkflowPhase> findByWorkflowIdOrderByOrderIndexAsc(Long workflowId);
    boolean existsByWorkflowIdAndNameIgnoreCase(Long workflowId, String name);
    Optional<WorkflowPhase> findFirstByWorkflowIdAndNameIgnoreCase(Long workflowId, String name);

    default int nextOrderIndex(Long workflowId) {
        List<WorkflowPhase> phases = findByWorkflowIdOrderByOrderIndexAsc(workflowId);
        return phases.isEmpty() ? 0 : phases.get(phases.size() - 1).getOrderIndex() + 1;
    }
}
