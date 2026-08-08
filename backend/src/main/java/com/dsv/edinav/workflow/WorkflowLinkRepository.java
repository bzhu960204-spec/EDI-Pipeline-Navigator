package com.dsv.edinav.workflow;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface WorkflowLinkRepository extends JpaRepository<WorkflowLink, Long> {
    List<WorkflowLink> findByMasterWorkflowIdOrderByOrderIndexAsc(Long masterWorkflowId);
    List<WorkflowLink> findByFromWorkflowIdOrToWorkflowId(Long fromWorkflowId, Long toWorkflowId);
    void deleteByMasterWorkflowId(Long masterWorkflowId);

    default int nextOrderIndex(Long masterWorkflowId) {
        List<WorkflowLink> links = findByMasterWorkflowIdOrderByOrderIndexAsc(masterWorkflowId);
        return links.isEmpty() ? 0 : links.get(links.size() - 1).getOrderIndex() + 1;
    }
}
