package com.dsv.edinav.workflow.dto;

import java.util.List;

public record CompositeMemberDto(
        WorkflowDto workflow,
        List<WorkflowStepDto> tree
) {}
