package com.dsv.edinav.template;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface DirTemplateRepository extends JpaRepository<DirTemplate, Long> {
    List<DirTemplate> findAllByOrderByNameAsc();
    Optional<DirTemplate> findFirstByIsDefaultTrue();
    boolean existsByNameIgnoreCase(String name);
}
