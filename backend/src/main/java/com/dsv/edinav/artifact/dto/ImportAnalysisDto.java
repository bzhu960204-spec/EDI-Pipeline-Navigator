package com.dsv.edinav.artifact.dto;

import java.util.List;

/** Result of analysing an uploaded import archive against a selected template. */
public record ImportAnalysisDto(
        String importToken,
        List<ImportNodeDto> importTree,
        List<TemplateFolderDto> templateFolders,
        int fileCount,
        int folderCount,
        long totalBytes
) {}
