package com.dsv.edinav.artifact.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UpdateArtifactRequest(
        @NotBlank @Size(max = 200) String name,
        @Size(max = 60) String ediRef
) {}
