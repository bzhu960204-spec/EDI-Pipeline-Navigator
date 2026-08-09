package com.dsv.edinav.workflow;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface WorkflowStepRepository extends JpaRepository<WorkflowStep, Long> {
    List<WorkflowStep> findByParentIdOrderByOrderIndexAsc(Long parentId);

    @Query("select s from WorkflowStep s join s.businessRoleIds r where r = :roleId order by s.orderIndex asc")
    List<WorkflowStep> findByBusinessRoleIdOrderByOrderIndexAsc(@Param("roleId") Long roleId);

    List<WorkflowStep> findByPhaseIdOrderByOrderIndexAsc(Long phaseId);
    List<WorkflowStep> findByWorkflowIdOrderByOrderIndexAsc(Long workflowId);
    List<WorkflowStep> findByWorkflowIdIsNull();
    List<WorkflowStep> findAllByOrderByOrderIndexAsc();

    @Query("select count(s) from WorkflowStep s join s.businessRoleIds r where r = :roleId")
    long countByBusinessRoleId(@Param("roleId") Long roleId);

    long countByWorkflowId(Long workflowId);

    default int nextOrderIndex(Long parentId) {
        List<WorkflowStep> siblings = findByParentIdOrderByOrderIndexAsc(parentId);
        return siblings.isEmpty() ? 0 : siblings.get(siblings.size() - 1).getOrderIndex() + 1;
    }
}
