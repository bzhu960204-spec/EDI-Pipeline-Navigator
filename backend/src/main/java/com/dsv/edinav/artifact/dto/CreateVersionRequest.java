package com.dsv.edinav.artifact.dto;

/** Body for creating a new artifact version from a previously analysed upload. */
public record CreateVersionRequest(
        String token,
        String comment
) {}
