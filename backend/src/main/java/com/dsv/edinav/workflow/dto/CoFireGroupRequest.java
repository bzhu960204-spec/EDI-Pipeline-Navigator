package com.dsv.edinav.workflow.dto;

import jakarta.validation.constraints.NotEmpty;

import java.util.List;

public record CoFireGroupRequest(
        @NotEmpty List<Long> transitionIds
) {}
