package com.dsv.edinav.workflow.dto;

public record WorkflowDto(
        Long id,
        String name,
        String description,
        String type,
        String status,
        Long entryStepId,
        int version,
        int orderIndex,
        long stepCount
) {}
