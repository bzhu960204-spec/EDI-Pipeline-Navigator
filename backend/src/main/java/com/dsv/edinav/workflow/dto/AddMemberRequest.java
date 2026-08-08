package com.dsv.edinav.workflow.dto;

import jakarta.validation.constraints.NotNull;

public record AddMemberRequest(
        @NotNull Long subWorkflowId
) {}
