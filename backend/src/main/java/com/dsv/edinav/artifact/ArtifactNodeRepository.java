package com.dsv.edinav.artifact;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ArtifactNodeRepository extends JpaRepository<ArtifactNode, Long> {
    List<ArtifactNode> findByArtifactIdOrderByOrderIndexAsc(Long artifactId);
    List<ArtifactNode> findByVersionIdOrderByOrderIndexAsc(Long versionId);
    List<ArtifactNode> findByParentIdOrderByOrderIndexAsc(Long parentId);
    void deleteByArtifactId(Long artifactId);
    void deleteByVersionId(Long versionId);

    /** How many nodes (across all versions of any artifact) still reference this stored file. */
    long countByStoredPath(String storedPath);

    default int nextOrderIndex(Long artifactId, Long parentId) {
        List<ArtifactNode> siblings = findByParentIdOrderByOrderIndexAsc(parentId);
        return siblings.isEmpty() ? 0 : siblings.get(siblings.size() - 1).getOrderIndex() + 1;
    }

    /** Next order index for a node within one version's tree (scoped by version, not global parentId). */
    default int nextOrderIndexInVersion(Long versionId, Long parentId) {
        List<ArtifactNode> siblings = findByVersionIdOrderByOrderIndexAsc(versionId).stream()
                .filter(n -> java.util.Objects.equals(n.getParentId(), parentId))
                .toList();
        return siblings.isEmpty() ? 0 : siblings.get(siblings.size() - 1).getOrderIndex() + 1;
    }
}
