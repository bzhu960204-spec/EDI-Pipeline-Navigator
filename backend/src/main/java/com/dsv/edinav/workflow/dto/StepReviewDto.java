package com.dsv.edinav.workflow.dto;

import java.time.Instant;

public record StepReviewDto(
        Long id,
        Long stepId,
        String content,
        Instant createdAt,
        Instant updatedAt
) {}
