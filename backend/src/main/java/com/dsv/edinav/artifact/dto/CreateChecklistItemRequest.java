package com.dsv.edinav.artifact.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Creates a checklist item under a folder (folderNodeId null = artifact root). */
public record CreateChecklistItemRequest(
        Long folderNodeId,
        @NotBlank @Size(max = 200) String label,
        @Size(max = 400) String description,
        boolean required
) {}
