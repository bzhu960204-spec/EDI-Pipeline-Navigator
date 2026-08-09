package com.dsv.edinav.workflow.dto;

public record WorkflowFolderDto(
        Long id,
        String name,
        String color,
        String description,
        int orderIndex
) {}
