package com.dsv.edinav.workflow.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record WorkflowRequest(
        @NotBlank @Size(max = 200) String name,
        @Size(max = 4000) String description,
        @Size(max = 20) String type,
        @Size(max = 20) String status,
        Long entryStepId
) {}
