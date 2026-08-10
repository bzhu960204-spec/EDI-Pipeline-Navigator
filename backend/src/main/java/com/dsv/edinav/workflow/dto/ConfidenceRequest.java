package com.dsv.edinav.workflow.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

/** Request to set the manual trust rating (0-5) of a workflow version. */
public record ConfidenceRequest(
        @NotNull @Min(0) @Max(5) Integer confidence
) {}
