package com.dsv.edinav.workflow.dto;

import java.time.Instant;

/** A review carried in an imported/exported step. {@code createdAt} is optional; defaults to now on import. */
public record ImportReviewNode(
        String content,
        Instant createdAt
) {}
