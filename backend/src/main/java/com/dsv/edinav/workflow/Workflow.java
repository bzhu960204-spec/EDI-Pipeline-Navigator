package com.dsv.edinav.workflow;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

/**
 * A named, savable workflow container. A {@code SUB} workflow is a reusable piece holding its own
 * {@link WorkflowStep} tree and transitions; a {@code MASTER} composes sub-workflows via links.
 */
@Entity
@Table(name = "workflow")
public class Workflow {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 200)
    private String name;

    @Lob
    @Column(length = 4000)
    private String description;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private WorkflowType type = WorkflowType.SUB;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private WorkflowStatus status = WorkflowStatus.DRAFT;

    /** Entry step for composition; upstream links connect into this step. Null until marked. */
    private Long entryStepId;

    /** Reserved for future versioning; not yet exposed as a feature. */
    @Column(nullable = false)
    private int version = 1;

    @Column(nullable = false)
    private int orderIndex;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public WorkflowType getType() { return type; }
    public void setType(WorkflowType type) { this.type = type; }

    public WorkflowStatus getStatus() { return status; }
    public void setStatus(WorkflowStatus status) { this.status = status; }

    public Long getEntryStepId() { return entryStepId; }
    public void setEntryStepId(Long entryStepId) { this.entryStepId = entryStepId; }

    public int getVersion() { return version; }
    public void setVersion(int version) { this.version = version; }

    public int getOrderIndex() { return orderIndex; }
    public void setOrderIndex(int orderIndex) { this.orderIndex = orderIndex; }
}
