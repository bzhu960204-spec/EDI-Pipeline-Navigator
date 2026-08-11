package com.dsv.edinav.workflow.dto;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

public record CreateTransitionGroupRequest(
        @NotNull Long fromStepId,
        @Size(max = 200) String label,
        @NotEmpty List<Long> toStepIds
) {}
