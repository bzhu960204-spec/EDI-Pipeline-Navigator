package com.dsv.edinav.artifact;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

/** A folder or file within an artifact's tree. Files carry a {@code storedPath} on disk. */
@Entity
@Table(name = "artifact_node")
public class ArtifactNode {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long artifactId;

    /** Version snapshot this node belongs to; nullable only for legacy rows before backfill. */
    private Long versionId;

    private Long parentId;

    @Column(nullable = false, length = 260)
    private String name;

    @Column(nullable = false)
    private boolean folder;

    @Column(nullable = false)
    private int orderIndex;

    /** Relative path under the storage root; null for folders. */
    @Column(length = 400)
    private String storedPath;

    private long sizeBytes;

    @Column(length = 150)
    private String contentType;

    /** SHA-256 hex of the file content; null for folders or legacy files not yet hashed. */
    @Column(length = 64)
    private String hash;

    /** Freeform user notes about this file/folder (e.g. what changed, what still needs work). */
    @Column(columnDefinition = "TEXT")
    private String notes;

    @Column(nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getArtifactId() { return artifactId; }
    public void setArtifactId(Long artifactId) { this.artifactId = artifactId; }

    public Long getVersionId() { return versionId; }
    public void setVersionId(Long versionId) { this.versionId = versionId; }

    public Long getParentId() { return parentId; }
    public void setParentId(Long parentId) { this.parentId = parentId; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public boolean isFolder() { return folder; }
    public void setFolder(boolean folder) { this.folder = folder; }

    public int getOrderIndex() { return orderIndex; }
    public void setOrderIndex(int orderIndex) { this.orderIndex = orderIndex; }

    public String getStoredPath() { return storedPath; }
    public void setStoredPath(String storedPath) { this.storedPath = storedPath; }

    public long getSizeBytes() { return sizeBytes; }
    public void setSizeBytes(long sizeBytes) { this.sizeBytes = sizeBytes; }

    public String getContentType() { return contentType; }
    public void setContentType(String contentType) { this.contentType = contentType; }

    public String getHash() { return hash; }
    public void setHash(String hash) { this.hash = hash; }

    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
