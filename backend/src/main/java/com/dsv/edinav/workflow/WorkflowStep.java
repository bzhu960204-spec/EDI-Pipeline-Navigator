package com.dsv.edinav.workflow;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Lob;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * A node in the single company-wide workflow. Steps form a hierarchy via {@code parentId}
 * (sub-steps) and a flow via {@link WorkflowTransition} (branching next-steps).
 */
@Entity
@Table(name = "workflow_step")
public class WorkflowStep {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Owning workflow container; every step belongs to exactly one workflow. */
    private Long workflowId;

    /** Stable identity of a logical step across versions; copied when a version is cloned so it survives renames/moves. */
    @Column(length = 36)
    private String lineageKey;

    /** Parent step for sub-steps; null for a root step within its workflow. */
    private Long parentId;

    /** Order among siblings sharing the same parent. */
    @Column(nullable = false)
    private int orderIndex;

    @Column(nullable = false, length = 200)
    private String name;

    @Lob
    @Column(length = 4000)
    private String description;

    @Lob
    @Column(length = 4000)
    private String notes;

    /** Responsible business roles; empty if unassigned. A step may be shared by several roles. */
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "workflow_step_role", joinColumns = @JoinColumn(name = "step_id"))
    @Column(name = "business_role_id")
    private List<Long> businessRoleIds = new ArrayList<>();

    /** Business phase (band) this step belongs to; null if ungrouped. */
    private Long phaseId;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getWorkflowId() { return workflowId; }
    public void setWorkflowId(Long workflowId) { this.workflowId = workflowId; }

    public String getLineageKey() { return lineageKey; }
    public void setLineageKey(String lineageKey) { this.lineageKey = lineageKey; }

    public Long getParentId() { return parentId; }
    public void setParentId(Long parentId) { this.parentId = parentId; }

    public int getOrderIndex() { return orderIndex; }
    public void setOrderIndex(int orderIndex) { this.orderIndex = orderIndex; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }

    public List<Long> getBusinessRoleIds() { return businessRoleIds; }
    public void setBusinessRoleIds(List<Long> businessRoleIds) {
        this.businessRoleIds = businessRoleIds == null ? new ArrayList<>() : businessRoleIds;
    }

    public Long getPhaseId() { return phaseId; }
    public void setPhaseId(Long phaseId) { this.phaseId = phaseId; }

    @PrePersist
    void ensureLineageKey() {
        if (lineageKey == null || lineageKey.isBlank()) {
            lineageKey = UUID.randomUUID().toString();
        }
    }
}
