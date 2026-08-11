package com.dsv.edinav.workflow;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * A named condition on a step's outgoing flow. All transitions that belong to one group start
 * together (AND); different groups of the same source step are alternative conditions (choose one).
 */
@Entity
@Table(name = "workflow_transition_group")
public class TransitionGroup {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long fromStepId;

    /** Condition/branch label, e.g. "Request accepted"; null/blank means an unconditional group. */
    @Column(length = 200)
    private String label;

    /** Order among the source step's groups. */
    @Column(nullable = false)
    private int orderIndex;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getFromStepId() { return fromStepId; }
    public void setFromStepId(Long fromStepId) { this.fromStepId = fromStepId; }

    public String getLabel() { return label; }
    public void setLabel(String label) { this.label = label; }

    public int getOrderIndex() { return orderIndex; }
    public void setOrderIndex(int orderIndex) { this.orderIndex = orderIndex; }
}
