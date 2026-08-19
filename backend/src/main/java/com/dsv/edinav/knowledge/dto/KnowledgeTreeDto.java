package com.dsv.edinav.knowledge.dto;

public record KnowledgeTreeDto(
        Long id,
        String name,
        String description,
        Long rootNodeId,
        Long groupId,
        int version,
        String versionLabel,
        boolean isCurrent,
        int orderIndex,
        long nodeCount
) {}
