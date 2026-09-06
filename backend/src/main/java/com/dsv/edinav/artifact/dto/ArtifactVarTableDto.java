package com.dsv.edinav.artifact.dto;

import java.time.Instant;

public record ArtifactVarTableDto(
        Long id,
        String name,
        int orderIndex,
        Instant createdAt,
        Instant updatedAt
) {}
