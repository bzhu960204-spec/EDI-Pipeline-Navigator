package com.dsv.edinav.artifact.dto;

/**
 * Applies a variable-table template to an artifact.
 * {@code mode} is {@code MERGE} (add missing tabs/keys, keep existing values) or
 * {@code REPLACE} (clear all tabs first, then recreate from the template with empty values).
 */
public record ApplyVarTemplateRequest(
        Long templateId,
        String mode
) {}
