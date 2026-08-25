package com.dsv.edinav.artifact.dto;

import java.time.Instant;

public record ArtifactLogDto(
        Long id,
        String title,
        String content,
        Instant createdAt,
        Instant updatedAt
) {}
