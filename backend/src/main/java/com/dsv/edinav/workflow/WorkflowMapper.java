package com.dsv.edinav.workflow;

import com.dsv.edinav.workflow.dto.BusinessRoleDto;
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
        return new WorkflowFolderDto(f.getId(), f.getName(), f.getColor(), f.getDescription(), f.getOrderIndex());
    }

    static WorkflowPhaseDto toPhaseDto(WorkflowPhase phase) {
        return new WorkflowPhaseDto(phase.getId(), phase.getWorkflowId(), phase.getName(),
                phase.getColor(), phase.getOrderIndex(), phase.getDescription());
    }
}
