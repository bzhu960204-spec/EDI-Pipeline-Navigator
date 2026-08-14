package com.dsv.edinav.schematemplate;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface SchemaTemplateRepository extends JpaRepository<SchemaTemplate, Long> {

    List<SchemaTemplate> findByIsCurrentTrueOrderByNameAsc();

    List<SchemaTemplate> findByOwnerIdAndIsCurrentTrueOrderByNameAsc(Long ownerId);

    List<SchemaTemplate> findByGroupIdOrderByCreatedAtAsc(Long groupId);

    Optional<SchemaTemplate> findFirstByNameIgnoreCase(String name);

    Optional<SchemaTemplate> findFirstByOwnerIdAndNameIgnoreCase(Long ownerId, String name);

    boolean existsByGroupIdAndVersionIgnoreCase(Long groupId, String version);
}
