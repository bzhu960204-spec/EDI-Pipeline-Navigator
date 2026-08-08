package com.dsv.edinav.template.dto;

public record TemplateSummaryDto(
        Long id,
        String name,
        String description,
        boolean isDefault
) {}
