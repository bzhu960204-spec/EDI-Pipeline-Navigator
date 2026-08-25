package com.dsv.edinav.template.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.List;

/** A folder definition in a template create/update request; children are nested folders. */
public record TemplateNodeInput(
        @NotBlank @Size(max = 200) String name,
        @Size(max = 400) String description,
        List<TemplateNodeInput> children,
        List<ChecklistItemInput> checklist
) {}
