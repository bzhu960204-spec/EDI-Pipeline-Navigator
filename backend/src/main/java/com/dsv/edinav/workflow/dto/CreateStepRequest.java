package com.dsv.edinav.workflow.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateStepRequest(
        Long workflowId,
        Long parentId,
        @NotBlank @Size(max = 200) String name,
        @Size(max = 4000) String description,
        @Size(max = 4000) String notes,
        Long businessRoleId
) {}
