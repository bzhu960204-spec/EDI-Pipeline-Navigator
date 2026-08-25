package com.dsv.edinav.artifact.dto;

/** Assigns a file to a checklist item; a null nodeId clears the assignment. */
public record AssignChecklistRequest(Long nodeId) {}
