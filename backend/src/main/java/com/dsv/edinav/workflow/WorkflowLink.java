package com.dsv.edinav.workflow;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * A jigsaw seam within a master workflow: connects an exit step of one placed sub-workflow to the
 * entry step of another. Null {@code fromExitStepId}/{@code toEntryStepId} mean "the sub's end/entry".
 */
@Entity
@Table(name = "workflow_link")
public class WorkflowLink {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long masterWorkflowId;

    @Column(nullable = false)
    private Long fromWorkflowId;

    private Long fromExitStepId;

    @Column(nullable = false)
    private Long toWorkflowId;

    private Long toEntryStepId;

    @Column(length = 200)
    private String label;

    @Column(nullable = false)
    private int orderIndex;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getMasterWorkflowId() { return masterWorkflowId; }
    public void setMasterWorkflowId(Long masterWorkflowId) { this.masterWorkflowId = masterWorkflowId; }

    public Long getFromWorkflowId() { return fromWorkflowId; }
    public void setFromWorkflowId(Long fromWorkflowId) { this.fromWorkflowId = fromWorkflowId; }

    public Long getFromExitStepId() { return fromExitStepId; }
    public void setFromExitStepId(Long fromExitStepId) { this.fromExitStepId = fromExitStepId; }

    public Long getToWorkflowId() { return toWorkflowId; }
    public void setToWorkflowId(Long toWorkflowId) { this.toWorkflowId = toWorkflowId; }

    public Long getToEntryStepId() { return toEntryStepId; }
    public void setToEntryStepId(Long toEntryStepId) { this.toEntryStepId = toEntryStepId; }

    public String getLabel() { return label; }
    public void setLabel(String label) { this.label = label; }

    public int getOrderIndex() { return orderIndex; }
    public void setOrderIndex(int orderIndex) { this.orderIndex = orderIndex; }
}
