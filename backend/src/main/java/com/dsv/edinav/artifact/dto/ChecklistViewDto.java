package com.dsv.edinav.artifact.dto;

import java.util.List;

public record ChecklistViewDto(
        ChecklistSummaryDto summary,
        List<ChecklistFolderDto> folders
) {}
