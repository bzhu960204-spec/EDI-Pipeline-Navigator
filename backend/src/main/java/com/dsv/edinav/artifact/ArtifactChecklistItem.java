package com.dsv.edinav.artifact;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** A required/optional file expected within an artifact folder (or the artifact root when folderNodeId is null). */
@Entity
@Table(name = "artifact_checklist_item")
public class ArtifactChecklistItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long artifactId;

    /** Version snapshot this item belongs to; nullable only for legacy rows before backfill. */
    private Long versionId;

    /** Folder this item belongs to; null means the artifact root level. */
    private Long folderNodeId;

    @Column(nullable = false, length = 200)
    private String label;

    @Column(length = 400)
    private String description;

    /** true = mandatory upload, false = optional upload. */
    @Column(nullable = false)
    private boolean required;

    /** File node that the user manually assigned to fulfil this item; null when unfulfilled. */
    private Long satisfiedByNodeId;

    @Column(nullable = false)
    private int orderIndex;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getArtifactId() { return artifactId; }
    public void setArtifactId(Long artifactId) { this.artifactId = artifactId; }

    public Long getVersionId() { return versionId; }
    public void setVersionId(Long versionId) { this.versionId = versionId; }

    public Long getFolderNodeId() { return folderNodeId; }
    public void setFolderNodeId(Long folderNodeId) { this.folderNodeId = folderNodeId; }

    public String getLabel() { return label; }
    public void setLabel(String label) { this.label = label; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public boolean isRequired() { return required; }
    public void setRequired(boolean required) { this.required = required; }

    public Long getSatisfiedByNodeId() { return satisfiedByNodeId; }
    public void setSatisfiedByNodeId(Long satisfiedByNodeId) { this.satisfiedByNodeId = satisfiedByNodeId; }

    public int getOrderIndex() { return orderIndex; }
    public void setOrderIndex(int orderIndex) { this.orderIndex = orderIndex; }
}
