package com.dsv.edinav.artifact.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record AdvanceRequest(
        @NotNull Long toStepId,
        @Size(max = 500) String comment
) {}
