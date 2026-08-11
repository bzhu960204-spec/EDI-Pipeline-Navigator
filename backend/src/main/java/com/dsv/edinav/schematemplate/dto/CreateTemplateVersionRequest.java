package com.dsv.edinav.schematemplate.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Publishes a new immutable version within an existing template group. */
public record CreateTemplateVersionRequest(
        @NotBlank @Size(max = 20) String version,
        @Size(max = 200) String versionLabel,
        @Size(max = 4000) String description,
        @NotBlank String content,
        @Size(max = 4000) String changeNotes
) {}
