package com.dsv.edinav.template.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.List;

public record TemplateRequest(
        @NotBlank @Size(max = 120) String name,
        @Size(max = 400) String description,
        boolean isDefault,
        @Valid List<TemplateNodeInput> nodes
) {}
