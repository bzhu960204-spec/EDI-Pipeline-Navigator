package com.dsv.edinav.workflow;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface WorkflowFolderRepository extends JpaRepository<WorkflowFolder, Long> {
    boolean existsByNameIgnoreCase(String name);
    boolean existsByNameIgnoreCaseAndOwnerId(String name, Long ownerId);
    boolean existsByNameIgnoreCaseAndOwnerIdAndIdNot(String name, Long ownerId, Long id);
    List<WorkflowFolder> findAllByOrderByOrderIndexAscNameAsc();
    List<WorkflowFolder> findByOwnerIdOrderByOrderIndexAscNameAsc(Long ownerId);
    long countByOwnerId(Long ownerId);
}
