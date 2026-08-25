package com.dsv.edinav.artifact;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ArtifactLogRepository extends JpaRepository<ArtifactLog, Long> {
    List<ArtifactLog> findByArtifactIdOrderByCreatedAtAsc(Long artifactId);
    void deleteByArtifactId(Long artifactId);
}
