package com.dsv.edinav.workflow.dto;

import jakarta.validation.constraints.Size;

/** Request to create a new editable version (deep copy) of a workflow. */
public record CreateVersionRequest(
        @Size(max = 200) String label
) {}
