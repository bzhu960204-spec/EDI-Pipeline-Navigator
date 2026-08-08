package com.dsv.edinav.workflow;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** Placement of a sub-workflow onto a master's canvas (a jigsaw piece); links connect placed pieces. */
@Entity
@Table(name = "workflow_composition")
public class WorkflowComposition {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long masterWorkflowId;

    @Column(nullable = false)
    private Long subWorkflowId;

    @Column(nullable = false)
    private int orderIndex;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getMasterWorkflowId() { return masterWorkflowId; }
    public void setMasterWorkflowId(Long masterWorkflowId) { this.masterWorkflowId = masterWorkflowId; }

    public Long getSubWorkflowId() { return subWorkflowId; }
    public void setSubWorkflowId(Long subWorkflowId) { this.subWorkflowId = subWorkflowId; }

    public int getOrderIndex() { return orderIndex; }
    public void setOrderIndex(int orderIndex) { this.orderIndex = orderIndex; }
}
