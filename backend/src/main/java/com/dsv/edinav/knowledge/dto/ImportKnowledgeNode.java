package com.dsv.edinav.knowledge.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.List;

/** One node in an import/export payload; {@code ref} carries a stable id-derived key for update matching. */
public record ImportKnowledgeNode(
        String ref,
        String lineageKey,
        @NotBlank @Size(max = 200) String name,
        @Size(max = 4000) String description,
        @Size(max = 4000) String notes,
        @Valid List<ImportKnowledgeNode> children
) {}
