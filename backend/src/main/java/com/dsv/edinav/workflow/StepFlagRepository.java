package com.dsv.edinav.workflow;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface StepFlagRepository extends JpaRepository<StepFlag, Long> {
    Optional<StepFlag> findByWorkflowIdAndLineageKey(Long workflowId, String lineageKey);

    List<StepFlag> findByWorkflowIdIn(Collection<Long> workflowIds);

    void deleteByWorkflowIdAndLineageKey(Long workflowId, String lineageKey);

    void deleteByWorkflowId(Long workflowId);
}
