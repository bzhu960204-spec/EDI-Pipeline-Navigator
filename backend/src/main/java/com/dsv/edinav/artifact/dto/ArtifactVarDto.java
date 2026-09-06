package com.dsv.edinav.artifact.dto;

public record ArtifactVarDto(
        Long id,
        String keyName,
        String value,
        int orderIndex
) {}
