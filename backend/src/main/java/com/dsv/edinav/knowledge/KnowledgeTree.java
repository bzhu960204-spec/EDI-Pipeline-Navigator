package com.dsv.edinav.knowledge;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

/**
 * A single-rooted, deeply nestable knowledge tree. Owned privately per user.
 * Every tree is one version within a group ({@code groupId}); versions of the same logical tree share
 * a {@code groupId}, and exactly one of them is flagged {@link #isCurrent()}.
 */
@Entity
@Table(name = "knowledge_tree")
public class KnowledgeTree {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** The user who owns this tree; trees are private per user. */
    private Long ownerId;

    @Column(nullable = false, length = 200)
    private String name;

    @Lob
    @Column(length = 4000)
    private String description;

    /** The single root node of this tree; every node descends from it. */
    private Long rootNodeId;

    /** Groups all versions of one logical tree; set to the row's own id for a brand-new tree. */
    private Long groupId;

    /** Version number within the group, starting at 1. */
    @Column(nullable = false, columnDefinition = "integer default 1")
    private int version = 1;

    /** Optional human label for this version, e.g. "before Schenker fix". */
    @Column(length = 200)
    private String versionLabel;

    /** The one version of the group shown in listings; exactly one per group is current. */
    @Column(nullable = false, columnDefinition = "boolean default true")
    private boolean isCurrent = true;

    @Column(nullable = false)
    private int orderIndex;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getOwnerId() { return ownerId; }
    public void setOwnerId(Long ownerId) { this.ownerId = ownerId; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public Long getRootNodeId() { return rootNodeId; }
    public void setRootNodeId(Long rootNodeId) { this.rootNodeId = rootNodeId; }

    public Long getGroupId() { return groupId; }
    public void setGroupId(Long groupId) { this.groupId = groupId; }

    public int getVersion() { return version; }
    public void setVersion(int version) { this.version = version; }

    public String getVersionLabel() { return versionLabel; }
    public void setVersionLabel(String versionLabel) { this.versionLabel = versionLabel; }

    public boolean isCurrent() { return isCurrent; }
    public void setCurrent(boolean current) { this.isCurrent = current; }

    public int getOrderIndex() { return orderIndex; }
    public void setOrderIndex(int orderIndex) { this.orderIndex = orderIndex; }
}
