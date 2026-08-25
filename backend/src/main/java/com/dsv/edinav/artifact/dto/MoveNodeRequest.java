package com.dsv.edinav.artifact.dto;

/** Move a node under a new parent folder; {@code parentId} null means the artifact root. */
public record MoveNodeRequest(
        Long parentId
) {}
