package com.dsv.edinav.artifact.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UpdateChecklistItemRequest(
        @NotBlank @Size(max = 200) String label,
        @Size(max = 400) String description,
        boolean required
) {}
