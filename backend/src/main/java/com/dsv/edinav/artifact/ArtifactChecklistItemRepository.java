package com.dsv.edinav.artifact;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ArtifactChecklistItemRepository extends JpaRepository<ArtifactChecklistItem, Long> {
    List<ArtifactChecklistItem> findByArtifactIdOrderByOrderIndexAsc(Long artifactId);
    List<ArtifactChecklistItem> findByVersionIdOrderByOrderIndexAsc(Long versionId);
    List<ArtifactChecklistItem> findByArtifactIdAndSatisfiedByNodeIdIn(Long artifactId, List<Long> nodeIds);
    void deleteByArtifactId(Long artifactId);
    void deleteByVersionId(Long versionId);

    default int nextOrderIndex(Long artifactId, Long folderNodeId) {
        List<ArtifactChecklistItem> items = findByArtifactIdOrderByOrderIndexAsc(artifactId).stream()
                .filter(i -> java.util.Objects.equals(i.getFolderNodeId(), folderNodeId))
                .toList();
        return items.isEmpty() ? 0 : items.get(items.size() - 1).getOrderIndex() + 1;
    }

    /** Next order index for a checklist item within one version (scoped by version, not artifact). */
    default int nextOrderIndexInVersion(Long versionId, Long folderNodeId) {
        List<ArtifactChecklistItem> items = findByVersionIdOrderByOrderIndexAsc(versionId).stream()
                .filter(i -> java.util.Objects.equals(i.getFolderNodeId(), folderNodeId))
                .toList();
        return items.isEmpty() ? 0 : items.get(items.size() - 1).getOrderIndex() + 1;
    }
}
