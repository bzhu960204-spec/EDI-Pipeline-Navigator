package com.dsv.edinav.workflow;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface WorkflowStepRepository extends JpaRepository<WorkflowStep, Long> {
    List<WorkflowStep> findByParentIdOrderByOrderIndexAsc(Long parentId);
    List<WorkflowStep> findByBusinessRoleIdOrderByOrderIndexAsc(Long businessRoleId);
    List<WorkflowStep> findByWorkflowIdOrderByOrderIndexAsc(Long workflowId);
    List<WorkflowStep> findByWorkflowIdIsNull();
    List<WorkflowStep> findAllByOrderByOrderIndexAsc();
    long countByBusinessRoleId(Long businessRoleId);
    long countByWorkflowId(Long workflowId);

    default int nextOrderIndex(Long parentId) {
        List<WorkflowStep> siblings = findByParentIdOrderByOrderIndexAsc(parentId);
        return siblings.isEmpty() ? 0 : siblings.get(siblings.size() - 1).getOrderIndex() + 1;
    }
}
