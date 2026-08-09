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
        String lineageKey,
        List<BusinessRoleDto> businessRoles,
        WorkflowPhaseDto phase,
        List<WorkflowStepDto> children,
        List<TransitionDto> transitions
) {}
