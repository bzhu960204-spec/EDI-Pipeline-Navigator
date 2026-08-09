package com.dsv.edinav.workflow.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record WorkflowPhaseRequest(
        @NotBlank @Size(max = 120) String name,
        @Size(max = 20) String color,
        Integer orderIndex,
        @Size(max = 400) String description
) {}
