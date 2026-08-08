package com.dsv.edinav.template.dto;

import java.util.List;

public record TemplateNodeDto(
        Long id,
        String name,
        List<TemplateNodeDto> children
) {}
