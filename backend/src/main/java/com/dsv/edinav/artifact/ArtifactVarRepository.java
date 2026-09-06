package com.dsv.edinav.artifact;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ArtifactVarRepository extends JpaRepository<ArtifactVar, Long> {
    List<ArtifactVar> findByTableIdOrderByOrderIndexAsc(Long tableId);
    void deleteByTableId(Long tableId);
    boolean existsByTableIdAndKeyNameIgnoreCase(Long tableId, String keyName);
    boolean existsByTableIdAndKeyNameIgnoreCaseAndIdNot(Long tableId, String keyName, Long id);
}
