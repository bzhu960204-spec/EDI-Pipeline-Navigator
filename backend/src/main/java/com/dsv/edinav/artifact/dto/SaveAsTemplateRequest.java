package com.dsv.edinav.artifact.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Reverse-saves an artifact's current folder structure and checklist into a new directory template. */
public record SaveAsTemplateRequest(
        @NotBlank @Size(max = 120) String name,
        @Size(max = 400) String description,
        boolean isDefault
) {}
