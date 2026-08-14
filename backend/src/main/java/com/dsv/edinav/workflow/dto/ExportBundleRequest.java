package com.dsv.edinav.workflow.dto;

import java.util.List;

/** Body for a bundle export: which workflow ids to export (empty = all current) + content toggles. */
public record ExportBundleRequest(
        List<Long> ids,
        boolean includePhases,
        boolean includeReviews
) {}
