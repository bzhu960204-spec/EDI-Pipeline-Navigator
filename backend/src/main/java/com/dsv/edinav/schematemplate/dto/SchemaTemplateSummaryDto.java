package com.dsv.edinav.schematemplate.dto;

import java.time.Instant;

/** Lightweight row for the template library list — the current version of each group, no content body. */
public record SchemaTemplateSummaryDto(
        Long id,
        Long groupId,
        String name,
        String description,
        String version,
        String versionLabel,
        boolean isCurrent,
        long versionCount,
        Instant createdAt,
        String createdBy
) {}
