package com.dsv.edinav.knowledge.dto;

import jakarta.validation.constraints.NotNull;

public record MoveKnowledgeNodeRequest(
        @NotNull Long newParentId,
        Integer newOrderIndex
) {}
