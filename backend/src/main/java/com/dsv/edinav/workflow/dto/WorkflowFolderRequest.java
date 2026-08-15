package com.dsv.edinav.workflow.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record WorkflowFolderRequest(
        @NotBlank @Size(max = 120) String name,
        @Size(max = 20) String color,
        @Size(max = 500) String description,
        Integer orderIndex,
        Long parentId
) {}
