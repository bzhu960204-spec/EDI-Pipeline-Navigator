package com.dsv.edinav.schematemplate;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface SchemaTemplateRepository extends JpaRepository<SchemaTemplate, Long> {

    List<SchemaTemplate> findByIsCurrentTrueOrderByNameAsc();

    List<SchemaTemplate> findByGroupIdOrderByCreatedAtAsc(Long groupId);

    Optional<SchemaTemplate> findFirstByNameIgnoreCase(String name);

    boolean existsByGroupIdAndVersionIgnoreCase(Long groupId, String version);
}
