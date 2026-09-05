package com.dsv.edinav.artifact.dto;

import java.time.Instant;

public record ArtifactVersionDto(
        Long id,
        int versionNumber,
        String comment,
        Long createdBy,
        String createdByName,
        Instant createdAt,
        boolean current
) {}
