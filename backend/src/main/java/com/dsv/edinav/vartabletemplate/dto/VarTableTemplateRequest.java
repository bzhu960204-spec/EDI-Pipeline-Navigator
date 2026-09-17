package com.dsv.edinav.vartabletemplate.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.List;

/** Create/update payload for a variable-table template. */
public record VarTableTemplateRequest(
        @NotBlank @Size(max = 200) String name,
        @Size(max = 4000) String description,
        List<VarTableTemplateTabDto> tabs
) {}
