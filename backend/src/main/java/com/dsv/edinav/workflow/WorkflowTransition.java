package com.dsv.edinav.workflow;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * A directed edge in the workflow flow. Each transition belongs to a {@link TransitionGroup}
 * (a named condition on the source step); transitions in the same group start together.
 */
@Entity
@Table(name = "workflow_transition")
public class WorkflowTransition {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** The condition group this edge belongs to. */
    private Long groupId;

    /** Co-fire group this edge joins on arrival; null = fires independently. Members share {@code toStepId}. */
    private Long coFireGroupId;

    @Column(nullable = false)
    private Long fromStepId;

    @Column(nullable = false)
    private Long toStepId;

    @Column(nullable = false)
    private int orderIndex;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getGroupId() { return groupId; }
    public void setGroupId(Long groupId) { this.groupId = groupId; }

    public Long getCoFireGroupId() { return coFireGroupId; }
    public void setCoFireGroupId(Long coFireGroupId) { this.coFireGroupId = coFireGroupId; }

    public Long getFromStepId() { return fromStepId; }
    public void setFromStepId(Long fromStepId) { this.fromStepId = fromStepId; }

    public Long getToStepId() { return toStepId; }
    public void setToStepId(Long toStepId) { this.toStepId = toStepId; }

    public int getOrderIndex() { return orderIndex; }
    public void setOrderIndex(int orderIndex) { this.orderIndex = orderIndex; }
}
