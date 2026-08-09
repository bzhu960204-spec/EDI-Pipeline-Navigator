package com.dsv.edinav.workflow.dto;

public record WorkflowPhaseDto(
        Long id,
        Long workflowId,
        String name,
        String color,
        int orderIndex,
        String description
) {}
