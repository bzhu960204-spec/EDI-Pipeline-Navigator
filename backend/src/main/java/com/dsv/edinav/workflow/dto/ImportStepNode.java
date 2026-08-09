package com.dsv.edinav.workflow.dto;

import java.util.List;

/**
 * A step in an imported sub-workflow; {@code children} nest to form the tree. Roles are resolved by
 * name: use {@code roles} for multiple, or the legacy singular {@code role} (both are merged).
 */
public record ImportStepNode(
        String ref,
        String name,
        String description,
        String notes,
        String role,
        List<String> roles,
        String phase,
        List<ImportStepNode> children
) {}
