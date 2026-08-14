package com.dsv.edinav.workflow;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

import java.util.ArrayList;
import java.util.List;

/**
 * A named, savable workflow that holds its own {@link WorkflowStep} tree and transitions.
 * Every workflow is one version within a group ({@code groupId}); versions of the same logical
 * workflow share a {@code groupId}, and exactly one of them is flagged {@link #isCurrent()}.
 */
@Entity
@Table(name = "workflow")
public class Workflow {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** The user who owns this workflow; every version in the group shares the same owner. */
    private Long ownerId;

    @Column(nullable = false, length = 200)
    private String name;

    @Lob
    @Column(length = 4000)
    private String description;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private WorkflowStatus status = WorkflowStatus.DRAFT;

    /** Groups all versions of one logical workflow; set to the row's own id for a brand-new workflow. */
    private Long groupId;

    /** Version number within the group, starting at 1. */
    @Column(nullable = false)
    private int version = 1;

    /** Optional human label for this version, e.g. "before Schenker fix". */
    @Column(length = 200)
    private String versionLabel;

    /** The one version of the group shown in listings and counted by cross-workflow views. */
    @Column(nullable = false, columnDefinition = "boolean default true")
    private boolean isCurrent = true;

    /** Manual trust rating for this version, 0 (unrated) to 5 (highest); AI-generated workflows start at 0. */
    @Column(nullable = false, columnDefinition = "integer default 0")
    private Integer confidence = 0;

    @Column(nullable = false)
    private int orderIndex;

    /** Optional {@link WorkflowFolder} this workflow lives in (single membership); null means ungrouped. */
    private Long folderId;

    /** Free-text labels attached to this workflow, for library grouping/filtering. */
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "workflow_tags", joinColumns = @JoinColumn(name = "workflow_id"))
    @Column(name = "tag", length = 80)
    private List<String> tags = new ArrayList<>();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getOwnerId() { return ownerId; }
    public void setOwnerId(Long ownerId) { this.ownerId = ownerId; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public WorkflowStatus getStatus() { return status; }
    public void setStatus(WorkflowStatus status) { this.status = status; }

    public Long getFolderId() { return folderId; }
    public void setFolderId(Long folderId) { this.folderId = folderId; }

    public Long getGroupId() { return groupId; }
    public void setGroupId(Long groupId) { this.groupId = groupId; }

    public int getVersion() { return version; }
    public void setVersion(int version) { this.version = version; }

    public String getVersionLabel() { return versionLabel; }
    public void setVersionLabel(String versionLabel) { this.versionLabel = versionLabel; }

    public boolean isCurrent() { return isCurrent; }
    public void setCurrent(boolean current) { this.isCurrent = current; }

    public Integer getConfidence() { return confidence == null ? 0 : confidence; }
    public void setConfidence(Integer confidence) { this.confidence = confidence == null ? 0 : confidence; }

    public int getOrderIndex() { return orderIndex; }
    public void setOrderIndex(int orderIndex) { this.orderIndex = orderIndex; }

    public List<String> getTags() { return tags; }
    public void setTags(List<String> tags) { this.tags = tags; }
}
