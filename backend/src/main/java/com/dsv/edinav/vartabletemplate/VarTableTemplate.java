package com.dsv.edinav.vartabletemplate;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

import java.time.Instant;

/**
 * A reusable variable-table skeleton owned by one user. Captures only the structure of an artifact's
 * variable tabs — each tab's name and its ordered key list — never the values. The tab/key structure
 * is serialized to JSON in {@link #content}; applying a template recreates the tabs with empty values.
 */
@Entity
@Table(name = "var_table_template")
public class VarTableTemplate {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** The user who owns this template; variable-table templates are private per user. */
    @Column(nullable = false)
    private Long ownerId;

    @Column(nullable = false, length = 200)
    private String name;

    @Lob
    @Column(length = 4000)
    private String description;

    /** JSON array of tabs: {@code [{"name":"DEV","keys":["a","b"]}]}. */
    @Lob
    @Column(nullable = false)
    private String content;

    @Column(nullable = false)
    private Instant createdAt = Instant.now();

    @Column(length = 200)
    private String createdBy;

    private Instant updatedAt;

    @Column(length = 200)
    private String updatedBy;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getOwnerId() { return ownerId; }
    public void setOwnerId(Long ownerId) { this.ownerId = ownerId; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }

    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }

    public String getUpdatedBy() { return updatedBy; }
    public void setUpdatedBy(String updatedBy) { this.updatedBy = updatedBy; }
}
