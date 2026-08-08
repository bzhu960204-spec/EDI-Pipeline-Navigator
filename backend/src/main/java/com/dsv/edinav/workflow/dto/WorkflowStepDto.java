package com.dsv.edinav.workflow.dto;

import java.util.List;

public record WorkflowStepDto(
        Long id,
        Long workflowId,
        Long parentId,
        int orderIndex,
        String name,
        String description,
        String notes,
        BusinessRoleDto businessRole,
        List<WorkflowStepDto> children,
        List<TransitionDto> transitions
) {}
