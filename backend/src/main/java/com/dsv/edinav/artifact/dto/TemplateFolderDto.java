package com.dsv.edinav.artifact.dto;

/** A template folder offered as an optional addition when importing a directory. */
public record TemplateFolderDto(
        String path,
        String name,
        int depth,
        boolean presentInImport
) {}
