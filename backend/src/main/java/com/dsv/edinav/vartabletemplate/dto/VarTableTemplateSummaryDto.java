package com.dsv.edinav.vartabletemplate.dto;

import java.time.Instant;

/** Lightweight listing row for the template picker/manager. */
public record VarTableTemplateSummaryDto(
        Long id,
        String name,
        String description,
        int tabCount,
        int keyCount,
        Instant createdAt,
        Instant updatedAt
) {}
