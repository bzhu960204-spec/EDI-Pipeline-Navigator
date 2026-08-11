package com.dsv.edinav.workflow;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

/**
 * A personal importance mark on a step, scoped per workflow version via {@code (workflowId, lineageKey)}.
 * Deliberately kept out of the import/export DTOs so it never leaves the database.
 */
@Entity
@Table(name = "workflow_step_flag",
        uniqueConstraints = @UniqueConstraint(columnNames = {"workflow_id", "lineage_key"}))
public class StepFlag {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "workflow_id", nullable = false)
    private Long workflowId;

    @Column(name = "lineage_key", nullable = false, length = 36)
    private String lineageKey;

    @Column(nullable = false, length = 20)
    private String level;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getWorkflowId() { return workflowId; }
    public void setWorkflowId(Long workflowId) { this.workflowId = workflowId; }

    public String getLineageKey() { return lineageKey; }
    public void setLineageKey(String lineageKey) { this.lineageKey = lineageKey; }

    public String getLevel() { return level; }
    public void setLevel(String level) { this.level = level; }
}
