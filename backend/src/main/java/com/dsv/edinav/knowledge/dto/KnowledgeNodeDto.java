package com.dsv.edinav.knowledge.dto;

public record KnowledgeNodeDto(
        Long id,
        Long treeId,
        Long parentId,
        String path,
        int depth,
        int orderIndex,
        String name,
        String description,
        String notes,
        long childCount
) {}
