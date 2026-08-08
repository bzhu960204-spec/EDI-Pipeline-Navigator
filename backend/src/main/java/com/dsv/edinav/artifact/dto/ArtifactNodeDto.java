package com.dsv.edinav.artifact.dto;

import java.time.Instant;
import java.util.List;

public record ArtifactNodeDto(
        Long id,
        Long parentId,
        String name,
        boolean folder,
        long sizeBytes,
        String contentType,
        Instant createdAt,
        List<ArtifactNodeDto> children
) {}
