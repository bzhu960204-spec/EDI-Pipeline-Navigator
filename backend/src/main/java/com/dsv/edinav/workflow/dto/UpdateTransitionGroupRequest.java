package com.dsv.edinav.workflow.dto;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

import java.util.List;

public record UpdateTransitionGroupRequest(
        @Size(max = 200) String label,
        @NotEmpty List<Long> toStepIds
) {}
