package com.dsv.edinav.workflow.dto;

public record TransitionDto(
        Long id,
        Long fromStepId,
        Long toStepId,
        String toStepName,
        String label,
        int orderIndex
) {}
