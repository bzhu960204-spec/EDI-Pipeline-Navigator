package com.dsv.edinav.schematemplate;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

import java.time.Instant;

/**
 * A versioned JSON "skeleton" for the sub-workflow import schema — the single source of truth
 * that used to live only in the README. Every row is one version within a group ({@code groupId});
 * versions of the same logical template share a {@code groupId}, and exactly one of them is flagged
 * {@link #isCurrent()}. Content is editable in place (with {@code updatedAt}/{@code updatedBy} audit)
 * so an earlier version's snapshot can be corrected without publishing a whole new version.
 */
@Entity
@Table(name = "schema_template")
public class SchemaTemplate {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Groups all versions of one logical template; set to the row's own id for a brand-new template. */
    private Long groupId;

    /** Template name, shared by every version in the group. */
    @Column(nullable = false, length = 200)
    private String name;

    @Lob
    @Column(length = 4000)
    private String description;

    /** Semantic version string, e.g. "1.0" — unique within the group. */
    @Column(nullable = false, length = 20)
    private String version;

    /** Optional human label for this version, e.g. "added coFireGroup field". */
    @Column(length = 200)
    private String versionLabel;

    /** The immutable JSON (jsonc) skeleton body, stored verbatim. */
    @Lob
    @Column(nullable = false)
    private String content;

    /** What changed relative to the previous version (changelog). */
    @Lob
    @Column(length = 4000)
    private String changeNotes;

    /** The one version of the group shown in listings by default. */
    @Column(nullable = false, columnDefinition = "boolean default true")
    private boolean isCurrent = true;

    @Column(nullable = false)
    private Instant createdAt = Instant.now();

    /** Username of whoever published this version. */
    @Column(length = 200)
    private String createdBy;

    /** Set whenever this version's content/metadata is edited in place (null until first edit). */
    private Instant updatedAt;

    /** Username of whoever last edited this version. */
    @Column(length = 200)
    private String updatedBy;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getGroupId() { return groupId; }
    public void setGroupId(Long groupId) { this.groupId = groupId; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getVersion() { return version; }
    public void setVersion(String version) { this.version = version; }

    public String getVersionLabel() { return versionLabel; }
    public void setVersionLabel(String versionLabel) { this.versionLabel = versionLabel; }

    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }

    public String getChangeNotes() { return changeNotes; }
    public void setChangeNotes(String changeNotes) { this.changeNotes = changeNotes; }

    public boolean isCurrent() { return isCurrent; }
    public void setCurrent(boolean current) { this.isCurrent = current; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }

    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }

    public String getUpdatedBy() { return updatedBy; }
    public void setUpdatedBy(String updatedBy) { this.updatedBy = updatedBy; }
}
