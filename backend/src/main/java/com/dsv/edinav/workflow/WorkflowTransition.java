package com.dsv.edinav.workflow;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * A directed edge in the workflow flow. Multiple transitions out of one step model
 * branching ("if condition A do X, else do Y"); the optional {@code label} names the condition.
 */
@Entity
@Table(name = "workflow_transition")
public class WorkflowTransition {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long fromStepId;

    @Column(nullable = false)
    private Long toStepId;

    /** Condition/branch label, e.g. "If rejected" or "Happy path". */
    @Column(length = 200)
    private String label;

    @Column(nullable = false)
    private int orderIndex;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getFromStepId() { return fromStepId; }
    public void setFromStepId(Long fromStepId) { this.fromStepId = fromStepId; }

    public Long getToStepId() { return toStepId; }
    public void setToStepId(Long toStepId) { this.toStepId = toStepId; }

    public String getLabel() { return label; }
    public void setLabel(String label) { this.label = label; }

    public int getOrderIndex() { return orderIndex; }
    public void setOrderIndex(int orderIndex) { this.orderIndex = orderIndex; }
}
