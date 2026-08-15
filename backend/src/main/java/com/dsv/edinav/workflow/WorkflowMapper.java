package com.dsv.edinav.workflow;

import com.dsv.edinav.workflow.dto.BusinessRoleDto;
import com.dsv.edinav.workflow.dto.StepReviewDto;
import com.dsv.edinav.workflow.dto.WorkflowFolderDto;
import com.dsv.edinav.workflow.dto.WorkflowPhaseDto;

/** Pure entity-to-DTO mappers shared by the workflow services. */
final class WorkflowMapper {

    private WorkflowMapper() {
    }

    static BusinessRoleDto toRoleDto(BusinessRole role) {
        return new BusinessRoleDto(role.getId(), role.getName(), role.getColor(), role.getDescription());
    }

    static WorkflowFolderDto toFolderDto(WorkflowFolder f) {
        return new WorkflowFolderDto(f.getId(), f.getParentId(), f.getName(), f.getColor(),
                f.getDescription(), f.getOrderIndex());
    }

    static WorkflowPhaseDto toPhaseDto(WorkflowPhase phase) {
        return new WorkflowPhaseDto(phase.getId(), phase.getWorkflowId(), phase.getName(),
                phase.getColor(), phase.getOrderIndex(), phase.getDescription());
    }

    static StepReviewDto toReviewDto(StepReview review) {
        return new StepReviewDto(review.getId(), review.getStepId(), review.getContent(),
                review.getCreatedAt(), review.getUpdatedAt());
    }
}
