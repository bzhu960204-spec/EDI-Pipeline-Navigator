package com.dsv.edinav.workflow;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface WorkflowCompositionRepository extends JpaRepository<WorkflowComposition, Long> {
    List<WorkflowComposition> findByMasterWorkflowIdOrderByOrderIndexAsc(Long masterWorkflowId);
    List<WorkflowComposition> findBySubWorkflowId(Long subWorkflowId);
    boolean existsByMasterWorkflowIdAndSubWorkflowId(Long masterWorkflowId, Long subWorkflowId);
    void deleteByMasterWorkflowIdAndSubWorkflowId(Long masterWorkflowId, Long subWorkflowId);
    void deleteByMasterWorkflowId(Long masterWorkflowId);

    default int nextOrderIndex(Long masterWorkflowId) {
        List<WorkflowComposition> members = findByMasterWorkflowIdOrderByOrderIndexAsc(masterWorkflowId);
        return members.isEmpty() ? 0 : members.get(members.size() - 1).getOrderIndex() + 1;
    }
}
