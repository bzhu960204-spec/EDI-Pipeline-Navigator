package com.dsv.edinav.workflow.dto;

public record WorkflowDto(
        Long id,
        String name,
        String description,
        String status,
        Long entryStepId,
        Long groupId,
        int version,
        String versionLabel,
        boolean isCurrent,
        int orderIndex,
        long stepCount
) {}
