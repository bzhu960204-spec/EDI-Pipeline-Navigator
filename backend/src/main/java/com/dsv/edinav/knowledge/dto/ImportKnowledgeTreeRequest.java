package com.dsv.edinav.knowledge.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.List;

/** Import/export payload for a whole tree; top-level {@code nodes} are the root's children (root is implied by the tree name). */
public record ImportKnowledgeTreeRequest(
        @NotBlank @Size(max = 200) String name,
        @Size(max = 4000) String description,
        @Valid List<ImportKnowledgeNode> nodes
) {}
