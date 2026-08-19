package com.dsv.edinav.knowledge.dto;

import jakarta.validation.constraints.Size;

/** Request to create a new editable version (deep copy) of a knowledge tree. */
public record CreateKnowledgeVersionRequest(
        @Size(max = 200) String label
) {}
