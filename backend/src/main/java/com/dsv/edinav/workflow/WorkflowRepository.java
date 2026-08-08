package com.dsv.edinav.workflow;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface WorkflowRepository extends JpaRepository<Workflow, Long> {
    List<Workflow> findAllByOrderByOrderIndexAsc();
    List<Workflow> findByTypeOrderByOrderIndexAsc(WorkflowType type);
    List<Workflow> findByTypeAndStatusOrderByOrderIndexAsc(WorkflowType type, WorkflowStatus status);
    boolean existsByNameIgnoreCase(String name);

    default int nextOrderIndex() {
        List<Workflow> all = findAllByOrderByOrderIndexAsc();
        return all.isEmpty() ? 0 : all.get(all.size() - 1).getOrderIndex() + 1;
    }
}
