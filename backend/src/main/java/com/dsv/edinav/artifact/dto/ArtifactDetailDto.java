package com.dsv.edinav.artifact.dto;

import java.time.Instant;
import java.util.List;

public record ArtifactDetailDto(
        Long id,
        String name,
        String ediRef,
        Long currentStepId,
        String currentStepName,
        Long templateId,
        Instant createdAt,
        Instant updatedAt,
        Long versionId,
        Integer versionNumber,
        Boolean currentVersion,
        List<ArtifactNodeDto> nodes
) {}
