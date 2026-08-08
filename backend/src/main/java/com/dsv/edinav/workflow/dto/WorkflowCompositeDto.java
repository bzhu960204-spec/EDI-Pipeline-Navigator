package com.dsv.edinav.workflow.dto;

import java.util.List;

public record WorkflowCompositeDto(
        WorkflowDto master,
        List<CompositeMemberDto> members,
        List<WorkflowLinkDto> links
) {}
