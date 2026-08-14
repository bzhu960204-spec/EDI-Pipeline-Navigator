package com.dsv.edinav.workflow.dto;

import java.util.List;

/**
 * Self-describing envelope for exporting/importing many workflows at once. Each element of
 * {@code workflows} is a plain {@link ImportWorkflowRequest}, so single and batch files share
 * the same per-workflow schema and round-trip identically.
 */
public record WorkflowBundle(
        String format,
        Integer formatVersion,
        String exportedAt,
        Integer count,
        List<ImportWorkflowRequest> workflows
) {
    public static final String FORMAT = "edinav-workflow-bundle";
    public static final int FORMAT_VERSION = 1;
}
