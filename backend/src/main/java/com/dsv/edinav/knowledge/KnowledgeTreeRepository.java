package com.dsv.edinav.knowledge;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface KnowledgeTreeRepository extends JpaRepository<KnowledgeTree, Long> {
    List<KnowledgeTree> findByOwnerIdOrderByOrderIndexAscNameAsc(Long ownerId);
    List<KnowledgeTree> findByOwnerIdAndIsCurrentTrueOrderByOrderIndexAscNameAsc(Long ownerId);
    List<KnowledgeTree> findByGroupIdOrderByVersionAsc(Long groupId);
    long countByOwnerId(Long ownerId);

    default int nextVersion(Long groupId) {
        return findByGroupIdOrderByVersionAsc(groupId).stream()
                .mapToInt(KnowledgeTree::getVersion).max().orElse(0) + 1;
    }
}
