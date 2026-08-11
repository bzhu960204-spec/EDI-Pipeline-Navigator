package com.dsv.edinav.schematemplate.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Creates a brand-new template as its first version. */
public record CreateSchemaTemplateRequest(
        @NotBlank @Size(max = 200) String name,
        @Size(max = 4000) String description,
        @Size(max = 20) String version,
        @Size(max = 200) String versionLabel,
        @NotBlank String content,
        @Size(max = 4000) String changeNotes
) {}
