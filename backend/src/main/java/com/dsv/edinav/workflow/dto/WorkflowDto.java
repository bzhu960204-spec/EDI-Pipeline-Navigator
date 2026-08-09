package com.dsv.edinav.workflow.dto;

import java.util.List;

public record WorkflowDto(
        Long id,
        String name,
        String description,
        String status,
        Long groupId,
        int version,
        String versionLabel,
        boolean isCurrent,
        int orderIndex,
        Long folderId,
        long stepCount,
        List<String> tags
) {}
