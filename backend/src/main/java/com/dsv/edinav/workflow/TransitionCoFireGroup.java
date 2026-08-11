package com.dsv.edinav.workflow;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * A synchronizing arrival into a step: every transition in one co-fire group shares the same target
 * step and they must all fire before it starts (AND). Different co-fire groups on the same target
 * are alternative ways to arrive (OR); a transition in no group fires independently.
 */
@Entity
@Table(name = "workflow_transition_cofire_group")
public class TransitionCoFireGroup {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** The shared target step every member transition points to. */
    @Column(nullable = false)
    private Long toStepId;

    /** Order among the target step's co-fire groups. */
    @Column(nullable = false)
    private int orderIndex;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getToStepId() { return toStepId; }
    public void setToStepId(Long toStepId) { this.toStepId = toStepId; }

    public int getOrderIndex() { return orderIndex; }
    public void setOrderIndex(int orderIndex) { this.orderIndex = orderIndex; }
}
