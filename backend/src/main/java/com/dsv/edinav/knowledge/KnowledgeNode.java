package com.dsv.edinav.knowledge;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

/**
 * A node in a {@link KnowledgeTree}. Nesting is an adjacency list via {@code parentId} for simple
 * writes, plus a materialized {@code path} (ancestor id chain including self, e.g. {@code /1/8/42/})
 * for cheap subtree and ancestor queries in a deep tree.
 */
@Entity
@Table(name = "knowledge_node", indexes = {
        @Index(name = "idx_knode_tree", columnList = "treeId"),
        @Index(name = "idx_knode_parent", columnList = "parentId")
})
public class KnowledgeNode {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Owning tree; every node belongs to exactly one tree. */
    @Column(nullable = false)
    private Long treeId;

    /** Parent node; null only for the tree's root node. */
    private Long parentId;

    /** Ancestor id chain including self, e.g. {@code /1/8/42/}. Root is {@code /<rootId>/}. */
    @Column(nullable = false, length = 1000)
    private String path;

    /** Depth from root; root = 0. */
    @Column(nullable = false)
    private int depth;

    /** Order among siblings sharing the same parent. */
    @Column(nullable = false)
    private int orderIndex;

    /** Stable identity kept across versions of the same logical tree, so version diffs align nodes despite rename/move. */
    @Column(length = 64)
    private String lineageKey;

    @Column(nullable = false, length = 200)
    private String name;

    @Lob
    @Column(length = 4000)
    private String description;

    @Lob
    @Column(length = 4000)
    private String notes;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getTreeId() { return treeId; }
    public void setTreeId(Long treeId) { this.treeId = treeId; }

    public Long getParentId() { return parentId; }
    public void setParentId(Long parentId) { this.parentId = parentId; }

    public String getPath() { return path; }
    public void setPath(String path) { this.path = path; }

    public int getDepth() { return depth; }
    public void setDepth(int depth) { this.depth = depth; }

    public int getOrderIndex() { return orderIndex; }
    public void setOrderIndex(int orderIndex) { this.orderIndex = orderIndex; }

    public String getLineageKey() { return lineageKey; }
    public void setLineageKey(String lineageKey) { this.lineageKey = lineageKey; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
}
