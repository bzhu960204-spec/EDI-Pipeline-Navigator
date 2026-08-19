package com.dsv.edinav.knowledge;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface KnowledgeNodeRepository extends JpaRepository<KnowledgeNode, Long> {

    List<KnowledgeNode> findByParentIdOrderByOrderIndexAscNameAsc(Long parentId);

    long countByParentId(Long parentId);

    long countByTreeId(Long treeId);

    /** Nodes whose id appears in the given collection, ordered from root to leaf, for breadcrumbs. */
    List<KnowledgeNode> findByIdInOrderByDepthAsc(List<Long> ids);

    /** A node and all of its descendants: the node's own path plus everything prefixed by it. */
    @Query("SELECT n FROM KnowledgeNode n WHERE n.path LIKE CONCAT(:pathPrefix, '%')")
    List<KnowledgeNode> findSubtreeByPathPrefix(@Param("pathPrefix") String pathPrefix);

    @Modifying
    @Query("DELETE FROM KnowledgeNode n WHERE n.path LIKE CONCAT(:pathPrefix, '%')")
    void deleteSubtreeByPathPrefix(@Param("pathPrefix") String pathPrefix);

    @Modifying
    @Query("DELETE FROM KnowledgeNode n WHERE n.treeId = :treeId")
    void deleteByTreeId(@Param("treeId") Long treeId);
}
