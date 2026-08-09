package com.dsv.edinav.workflow.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * Payload for importing a single sub-workflow (container + step tree + branching)
 * from JSON. Steps reference each other by a caller-supplied {@code ref} key rather than
 * database ids, which are assigned during import.
 */
public record ImportWorkflowRequest(
        @NotBlank @Size(max = 200) String name,
        @Size(max = 4000) String description,
        @Size(max = 20) String type,
        @Size(max = 20) String status,
        String entryStepRef,
        List<ImportPhaseNode> phases,
        List<ImportStepNode> steps,
        List<ImportTransition> transitions
) {}
