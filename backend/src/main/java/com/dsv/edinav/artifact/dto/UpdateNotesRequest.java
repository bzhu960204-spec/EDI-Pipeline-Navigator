package com.dsv.edinav.artifact.dto;

import jakarta.validation.constraints.Size;

public record UpdateNotesRequest(
        @Size(max = 10000) String notes
) {}
