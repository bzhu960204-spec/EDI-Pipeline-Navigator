package com.dsv.edinav.artifact.dto;

import java.util.List;

/** A folder or file discovered inside an uploaded import archive. */
public record ImportNodeDto(
        String name,
        String path,
        boolean folder,
        long sizeBytes,
        List<ImportNodeDto> children
) {}
