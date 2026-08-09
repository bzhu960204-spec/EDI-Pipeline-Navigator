package com.dsv.edinav.workflow;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * A business phase (band) within one workflow, used to group steps for swimlane display.
 * Orthogonal to {@link WorkflowStep#getParentId()} (sub-step nesting): a step may sit in a
 * phase and still have sub-steps.
 */
@Entity
@Table(name = "workflow_phase")
public class WorkflowPhase {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Owning workflow container; phases are scoped to a single workflow. */
    @Column(nullable = false)
    private Long workflowId;

    @Column(nullable = false, length = 120)
    private String name;

    /** Hex color used for the phase band/tag in the UI, e.g. #1677ff. */
    @Column(length = 20)
    private String color;

    /** Vertical order of the phase band (top to bottom). */
    @Column(nullable = false)
    private int orderIndex;

    @Column(length = 400)
    private String description;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getWorkflowId() { return workflowId; }
    public void setWorkflowId(Long workflowId) { this.workflowId = workflowId; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getColor() { return color; }
    public void setColor(String color) { this.color = color; }

    public int getOrderIndex() { return orderIndex; }
    public void setOrderIndex(int orderIndex) { this.orderIndex = orderIndex; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
}
