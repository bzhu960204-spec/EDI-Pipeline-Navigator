package com.dsv.edinav.workflow;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface WorkflowFolderRepository extends JpaRepository<WorkflowFolder, Long> {
    boolean existsByNameIgnoreCase(String name);
    boolean existsByNameIgnoreCaseAndIdNot(String name, Long id);
    List<WorkflowFolder> findAllByOrderByOrderIndexAscNameAsc();
}
