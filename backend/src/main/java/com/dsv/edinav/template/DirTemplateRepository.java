package com.dsv.edinav.template;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface DirTemplateRepository extends JpaRepository<DirTemplate, Long> {
    List<DirTemplate> findAllByOrderByNameAsc();
    List<DirTemplate> findByCreatedByOrderByNameAsc(Long createdBy);
    Optional<DirTemplate> findFirstByIsDefaultTrue();
    Optional<DirTemplate> findFirstByCreatedByAndIsDefaultTrue(Long createdBy);
    boolean existsByNameIgnoreCase(String name);
    boolean existsByNameIgnoreCaseAndCreatedBy(String name, Long createdBy);
}
