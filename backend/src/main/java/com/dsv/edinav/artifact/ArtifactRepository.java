package com.dsv.edinav.artifact;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ArtifactRepository extends JpaRepository<Artifact, Long> {
    List<Artifact> findByOwnerIdOrderByUpdatedAtDesc(Long ownerId);
    long countByOwnerId(Long ownerId);
    long countByCurrentStepId(Long currentStepId);
}
