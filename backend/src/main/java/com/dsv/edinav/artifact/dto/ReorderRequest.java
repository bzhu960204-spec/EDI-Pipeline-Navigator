package com.dsv.edinav.artifact.dto;

import java.util.List;

public record ReorderRequest(
        List<Long> orderedIds
) {}
