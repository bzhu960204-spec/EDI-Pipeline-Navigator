package com.dsv.edinav.template.dto;

import java.util.List;

public record TemplateDto(
        Long id,
        String name,
        String description,
        boolean isDefault,
        List<TemplateNodeDto> nodes,
        List<ChecklistItemDto> checklist
) {}
