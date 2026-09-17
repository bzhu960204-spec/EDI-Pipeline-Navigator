package com.dsv.edinav.artifact.dto;

/** Reverse-saves an artifact's variable tabs (or a single tab) into a new variable-table template. */
public record SaveVarTemplateRequest(
        String name,
        String description
) {}
