package com.dsv.edinav.workflow.dto;

import java.util.List;

/** A step in an imported sub-workflow; {@code children} nest to form the tree, {@code role} is resolved by name. */
public record ImportStepNode(
        String ref,
        String name,
        String description,
        String notes,
        String role,
        List<ImportStepNode> children
) {}
