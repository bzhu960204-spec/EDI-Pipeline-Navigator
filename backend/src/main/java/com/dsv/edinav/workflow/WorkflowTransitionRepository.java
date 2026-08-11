package com.dsv.edinav.workflow;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface WorkflowTransitionRepository extends JpaRepository<WorkflowTransition, Long> {
    List<WorkflowTransition> findByFromStepIdOrderByOrderIndexAsc(Long fromStepId);
    List<WorkflowTransition> findByGroupIdOrderByOrderIndexAsc(Long groupId);
    List<WorkflowTransition> findByCoFireGroupId(Long coFireGroupId);
    List<WorkflowTransition> findByFromStepIdInOrToStepIdIn(List<Long> fromStepIds, List<Long> toStepIds);
    void deleteByFromStepIdOrToStepId(Long fromStepId, Long toStepId);
    boolean existsByFromStepIdAndToStepId(Long fromStepId, Long toStepId);
    boolean existsByGroupId(Long groupId);
}
