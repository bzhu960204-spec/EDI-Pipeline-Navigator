package com.dsv.edinav.knowledge.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record KnowledgeTreeRequest(
        @NotBlank @Size(max = 200) String name,
        @Size(max = 4000) String description,
        Integer orderIndex
) {}
