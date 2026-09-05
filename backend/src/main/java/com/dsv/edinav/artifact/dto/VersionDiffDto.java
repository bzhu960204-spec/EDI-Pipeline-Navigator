package com.dsv.edinav.artifact.dto;

import java.util.List;

/**
 * Preview of a proposed new artifact version: the uploaded ZIP (kept staged under {@code token})
 * compared against the current version by full relative path + content hash.
 */
public record VersionDiffDto(
        String token,
        List<DiffEntry> added,
        List<DiffEntry> modified,
        List<DiffEntry> deleted,
        List<DiffEntry> unchanged,
        int addedCount,
        int modifiedCount,
        int deletedCount,
        int unchangedCount
) {}
