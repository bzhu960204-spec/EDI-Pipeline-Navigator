package com.dsv.edinav.artifact;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ArtifactVersionRepository extends JpaRepository<ArtifactVersion, Long> {
    List<ArtifactVersion> findByArtifactIdOrderByVersionNumberAsc(Long artifactId);
    Optional<ArtifactVersion> findByArtifactIdAndIsCurrentTrue(Long artifactId);
    long countByArtifactId(Long artifactId);
    void deleteByArtifactId(Long artifactId);

    default int nextVersionNumber(Long artifactId) {
        List<ArtifactVersion> versions = findByArtifactIdOrderByVersionNumberAsc(artifactId);
        return versions.isEmpty() ? 1 : versions.get(versions.size() - 1).getVersionNumber() + 1;
    }
}
