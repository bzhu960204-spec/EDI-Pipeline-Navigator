package com.dsv.edinav.workflow.dto;

import java.util.List;

/** Per-item outcome of a batch import; one failure never rolls back the others. */
public record BundleImportResult(
        List<Imported> imported,
        List<Failed> failed
) {
    public record Imported(Long id, String name) {}
    public record Failed(String name, String reason) {}
}
