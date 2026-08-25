package com.dsv.edinav.artifact.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RenameNodeRequest(
        @NotBlank @Size(max = 260) String name
) {}
