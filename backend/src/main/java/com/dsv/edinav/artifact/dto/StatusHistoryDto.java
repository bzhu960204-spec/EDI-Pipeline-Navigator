package com.dsv.edinav.artifact.dto;

import java.time.Instant;

public record StatusHistoryDto(
        Long id,
        Long fromStepId,
        String fromStepName,
        Long toStepId,
        String toStepName,
        Long changedBy,
        String changedByName,
        String comment,
        Instant changedAt
) {}
