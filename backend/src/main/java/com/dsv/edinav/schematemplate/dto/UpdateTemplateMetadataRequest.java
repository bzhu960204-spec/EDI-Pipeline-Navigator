package com.dsv.edinav.schematemplate.dto;

import jakarta.validation.constraints.Size;

/** Edits a version in place: mutable metadata plus (optionally) the {@code version} number and the
 *  JSON {@code content} snapshot. Renaming applies to the whole group so every version keeps the same
 *  template name; changing {@code version} still has to stay unique within the group. */
public record UpdateTemplateMetadataRequest(
        @Size(max = 200) String name,
        @Size(max = 4000) String description,
        @Size(max = 20) String version,
        @Size(max = 200) String versionLabel,
        String content,
        @Size(max = 4000) String changeNotes
) {}
