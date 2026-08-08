package com.dsv.edinav.artifact.dto;

import java.time.Instant;

public record ArtifactSummaryDto(
        Long id,
        String name,
        String ediRef,
        Long currentStepId,
        String currentStepName,
        Long templateId,
        int fileCount,
        Instant createdAt,
        Instant updatedAt
) {}
