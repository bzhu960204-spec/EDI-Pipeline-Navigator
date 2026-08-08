package com.dsv.edinav.artifact;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ArtifactNodeRepository extends JpaRepository<ArtifactNode, Long> {
    List<ArtifactNode> findByArtifactIdOrderByOrderIndexAsc(Long artifactId);
    List<ArtifactNode> findByParentIdOrderByOrderIndexAsc(Long parentId);
    void deleteByArtifactId(Long artifactId);

    default int nextOrderIndex(Long artifactId, Long parentId) {
        List<ArtifactNode> siblings = findByParentIdOrderByOrderIndexAsc(parentId);
        return siblings.isEmpty() ? 0 : siblings.get(siblings.size() - 1).getOrderIndex() + 1;
    }
}
