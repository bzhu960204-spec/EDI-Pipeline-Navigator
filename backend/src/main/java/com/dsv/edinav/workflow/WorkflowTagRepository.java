package com.dsv.edinav.workflow;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface WorkflowTagRepository extends JpaRepository<WorkflowTag, Long> {
    boolean existsByNameIgnoreCase(String name);
    boolean existsByNameIgnoreCaseAndIdNot(String name, Long id);
    Optional<WorkflowTag> findFirstByNameIgnoreCase(String name);
    List<WorkflowTag> findAllByOrderByNameAsc();
}
