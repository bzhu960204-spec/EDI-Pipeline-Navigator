package com.dsv.edinav.workflow.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record WorkflowLinkRequest(
        @NotNull Long masterWorkflowId,
        @NotNull Long fromWorkflowId,
        Long fromExitStepId,
        @NotNull Long toWorkflowId,
        Long toEntryStepId,
        @Size(max = 200) String label
) {}
