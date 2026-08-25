package com.dsv.edinav.artifact.dto;

public record ChecklistSummaryDto(
        int mandatoryTotal,
        int mandatorySatisfied,
        int optionalTotal,
        int optionalSatisfied,
        boolean complete
) {}
