package com.dsv.edinav.vartabletemplate.dto;

import java.util.List;

/** One tab in a variable-table template: a name plus its ordered key list (no values). */
public record VarTableTemplateTabDto(
        String name,
        List<String> keys
) {}
