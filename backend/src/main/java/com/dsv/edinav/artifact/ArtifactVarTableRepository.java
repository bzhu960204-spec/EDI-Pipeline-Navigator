package com.dsv.edinav.artifact;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ArtifactVarTableRepository extends JpaRepository<ArtifactVarTable, Long> {
    List<ArtifactVarTable> findByArtifactIdOrderByOrderIndexAsc(Long artifactId);
    List<ArtifactVarTable> findByArtifactId(Long artifactId);
    boolean existsByArtifactIdAndNameIgnoreCase(Long artifactId, String name);
    boolean existsByArtifactIdAndNameIgnoreCaseAndIdNot(Long artifactId, String name, Long id);
}
