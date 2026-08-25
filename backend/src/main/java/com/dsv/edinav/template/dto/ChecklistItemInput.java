package com.dsv.edinav.template.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** A checklist item definition sent when creating/updating or importing a template. */
public record ChecklistItemInput(
        @NotBlank @Size(max = 200) String label,
        @Size(max = 400) String description,
        boolean required
) {}
