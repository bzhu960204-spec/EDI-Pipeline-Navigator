package com.dsv.edinav.workflow.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record CreateTransitionRequest(
        @NotNull Long fromStepId,
        @NotNull Long toStepId,
        @Size(max = 200) String label
) {}
