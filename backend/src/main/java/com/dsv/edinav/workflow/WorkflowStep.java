package com.dsv.edinav.workflow;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

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

    /** Responsible business role; null if unassigned. */
    private Long businessRoleId;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getWorkflowId() { return workflowId; }
    public void setWorkflowId(Long workflowId) { this.workflowId = workflowId; }

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

    public Long getBusinessRoleId() { return businessRoleId; }
    public void setBusinessRoleId(Long businessRoleId) { this.businessRoleId = businessRoleId; }
}
