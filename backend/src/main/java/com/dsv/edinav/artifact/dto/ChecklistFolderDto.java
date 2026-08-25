package com.dsv.edinav.artifact.dto;

import java.util.List;

/** Checklist items grouped under one folder (folderNodeId null = artifact root). */
public record ChecklistFolderDto(
        Long folderNodeId,
        String folderName,
        String path,
        int mandatoryTotal,
        int mandatorySatisfied,
        int optionalTotal,
        int optionalSatisfied,
        List<ArtifactChecklistItemDto> items
) {}
