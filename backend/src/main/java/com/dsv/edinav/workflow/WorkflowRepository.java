package com.dsv.edinav.workflow;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface WorkflowRepository extends JpaRepository<Workflow, Long> {
    List<Workflow> findAllByOrderByOrderIndexAsc();
    List<Workflow> findByIsCurrentTrueOrderByOrderIndexAsc();
    List<Workflow> findByOwnerIdAndIsCurrentTrueOrderByOrderIndexAsc(Long ownerId);
    List<Workflow> findByGroupIdOrderByVersionAsc(Long groupId);
    boolean existsByNameIgnoreCase(String name);
    boolean existsByNameIgnoreCaseAndGroupIdNot(String name, Long groupId);
    boolean existsByNameIgnoreCaseAndOwnerId(String name, Long ownerId);
    boolean existsByNameIgnoreCaseAndOwnerIdAndGroupIdNot(String name, Long ownerId, Long groupId);

    default int nextOrderIndex() {
        List<Workflow> all = findAllByOrderByOrderIndexAsc();
        return all.isEmpty() ? 0 : all.get(all.size() - 1).getOrderIndex() + 1;
    }

    default int nextVersion(Long groupId) {
        return findByGroupIdOrderByVersionAsc(groupId).stream()
                .mapToInt(Workflow::getVersion).max().orElse(0) + 1;
    }
}
