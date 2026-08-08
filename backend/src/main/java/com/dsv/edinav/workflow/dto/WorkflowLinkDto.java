package com.dsv.edinav.workflow.dto;

public record WorkflowLinkDto(
        Long id,
        Long masterWorkflowId,
        Long fromWorkflowId,
        Long fromExitStepId,
        String fromExitStepName,
        Long toWorkflowId,
        Long toEntryStepId,
        String toEntryStepName,
        String label,
        int orderIndex
) {}
