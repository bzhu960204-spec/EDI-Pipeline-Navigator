package com.dsv.edinav.artifact.dto;

/** One file changed between the current version and an uploaded snapshot. */
public record DiffEntry(
        String path,
        String name,
        boolean folder,
        long sizeBytes,
        Long oldSizeBytes
) {}
