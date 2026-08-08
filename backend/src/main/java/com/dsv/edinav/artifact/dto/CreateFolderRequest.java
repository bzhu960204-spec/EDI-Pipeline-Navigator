package com.dsv.edinav.artifact.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateFolderRequest(
        Long parentId,
        @NotBlank @Size(max = 200) String name
) {}
