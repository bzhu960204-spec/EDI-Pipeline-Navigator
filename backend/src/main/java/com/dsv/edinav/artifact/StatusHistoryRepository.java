package com.dsv.edinav.artifact;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface StatusHistoryRepository extends JpaRepository<StatusHistory, Long> {
    List<StatusHistory> findByArtifactIdOrderByChangedAtDesc(Long artifactId);
    void deleteByArtifactId(Long artifactId);
}
