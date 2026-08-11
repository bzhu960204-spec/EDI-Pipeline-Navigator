package com.dsv.edinav.workflow.dto;

import jakarta.validation.constraints.Size;

/** Sets or clears a step's personal importance flag; a null/blank {@code level} clears it. */
public record FlagRequest(
        @Size(max = 20) String level
) {}
