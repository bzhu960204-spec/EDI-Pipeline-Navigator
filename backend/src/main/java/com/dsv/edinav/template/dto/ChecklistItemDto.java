package com.dsv.edinav.template.dto;

public record ChecklistItemDto(
        Long id,
        String label,
        String description,
        boolean required
) {}
