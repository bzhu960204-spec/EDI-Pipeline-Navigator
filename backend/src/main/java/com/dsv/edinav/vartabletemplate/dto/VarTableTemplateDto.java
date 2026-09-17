package com.dsv.edinav.vartabletemplate.dto;

import java.time.Instant;
import java.util.List;

/** Full template detail including every tab and its keys. */
public record VarTableTemplateDto(
        Long id,
        String name,
        String description,
        List<VarTableTemplateTabDto> tabs,
        Instant createdAt,
        String createdBy,
        Instant updatedAt,
        String updatedBy
) {}
