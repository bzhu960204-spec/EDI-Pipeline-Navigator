package com.dsv.edinav.artifact;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

/** Audit record of an artifact moving between workflow steps. */
@Entity
@Table(name = "status_history")
public class StatusHistory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long artifactId;

    private Long fromStepId;

    private Long toStepId;

    @Column(nullable = false)
    private Long changedBy;

    @Column(length = 500)
    private String comment;

    @Column(nullable = false, updatable = false)
    private Instant changedAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getArtifactId() { return artifactId; }
    public void setArtifactId(Long artifactId) { this.artifactId = artifactId; }

    public Long getFromStepId() { return fromStepId; }
    public void setFromStepId(Long fromStepId) { this.fromStepId = fromStepId; }

    public Long getToStepId() { return toStepId; }
    public void setToStepId(Long toStepId) { this.toStepId = toStepId; }

    public Long getChangedBy() { return changedBy; }
    public void setChangedBy(Long changedBy) { this.changedBy = changedBy; }

    public String getComment() { return comment; }
    public void setComment(String comment) { this.comment = comment; }

    public Instant getChangedAt() { return changedAt; }
    public void setChangedAt(Instant changedAt) { this.changedAt = changedAt; }
}
