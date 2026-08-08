package com.dsv.edinav.workflow.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record BusinessRoleRequest(
        @NotBlank @Size(max = 80) String name,
        @Size(max = 20) String color,
        @Size(max = 400) String description
) {}
