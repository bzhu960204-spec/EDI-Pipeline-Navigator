package com.dsv.edinav.schematemplate.dto;

import java.time.Instant;

/**
 * Full detail for a single template version, including the JSON skeleton body. {@code contentValid}
 * reports whether {@code content} still parses against the current import schema (advisory only —
 * an invalid body is never blocked from being stored).
 */
public record SchemaTemplateDto(
        Long id,
        Long groupId,
        String name,
        String description,
        String version,
        String versionLabel,
        String content,
        String changeNotes,
        boolean isCurrent,
        Instant createdAt,
        String createdBy,
        Instant updatedAt,
        String updatedBy,
        boolean contentValid,
        String contentError
) {}
