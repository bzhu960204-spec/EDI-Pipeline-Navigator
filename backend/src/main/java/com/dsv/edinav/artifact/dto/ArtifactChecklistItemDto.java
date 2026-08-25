package com.dsv.edinav.artifact.dto;

public record ArtifactChecklistItemDto(
        Long id,
        Long folderNodeId,
        String label,
        String description,
        boolean required,
        boolean satisfied,
        Long satisfiedByNodeId,
        String satisfiedByName
) {}
