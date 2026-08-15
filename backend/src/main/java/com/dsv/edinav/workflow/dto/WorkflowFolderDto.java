package com.dsv.edinav.workflow.dto;

public record WorkflowFolderDto(
        Long id,
        Long parentId,
        String name,
        String color,
        String description,
        int orderIndex
) {}
