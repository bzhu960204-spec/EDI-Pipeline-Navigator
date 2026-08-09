package com.dsv.edinav.workflow.dto;

/** A phase in an imported workflow; steps reference it by the caller-supplied {@code ref}. */
public record ImportPhaseNode(
        String ref,
        String name,
        String color,
        Integer orderIndex,
        String description
) {}
