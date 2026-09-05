package com.dsv.edinav.artifact;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

/**
 * One immutable snapshot of an artifact's file tree + checklist. Nodes and checklist items belong to a
 * version via {@code versionId}; exactly one version per artifact has {@code isCurrent=true}. Workflow
 * status/logs/history stay on the logical {@link Artifact} and are shared across versions.
 */
@Entity
@Table(name = "artifact_version")
public class ArtifactVersion {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long artifactId;

    @Column(nullable = false)
    private int versionNumber;

    /** Optional user note describing what this version changed. */
    @Column(length = 500)
    private String comment;

    @Column(nullable = false)
    private Long createdBy;

    @Column(nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    @Column(nullable = false, columnDefinition = "boolean default true")
    private boolean isCurrent = true;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getArtifactId() { return artifactId; }
    public void setArtifactId(Long artifactId) { this.artifactId = artifactId; }

    public int getVersionNumber() { return versionNumber; }
    public void setVersionNumber(int versionNumber) { this.versionNumber = versionNumber; }

    public String getComment() { return comment; }
    public void setComment(String comment) { this.comment = comment; }

    public Long getCreatedBy() { return createdBy; }
    public void setCreatedBy(Long createdBy) { this.createdBy = createdBy; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public boolean isCurrent() { return isCurrent; }
    public void setCurrent(boolean current) { this.isCurrent = current; }
}
