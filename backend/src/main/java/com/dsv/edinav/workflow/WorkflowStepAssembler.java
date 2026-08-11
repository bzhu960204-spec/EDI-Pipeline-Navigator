package com.dsv.edinav.workflow;

import com.dsv.edinav.workflow.dto.BusinessRoleDto;
import com.dsv.edinav.workflow.dto.StepReviewDto;
import com.dsv.edinav.workflow.dto.TransitionDto;
import com.dsv.edinav.workflow.dto.WorkflowStepDto;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/** Assembles the nested step DTO tree from pre-loaded lookup maps (pure, no repository access). */
final class WorkflowStepAssembler {

    private WorkflowStepAssembler() {
    }

    static List<WorkflowStepDto> buildChildren(Long parentKey,
                                               Map<Long, List<WorkflowStep>> byParent,
                                               Map<Long, List<WorkflowTransition>> byFrom,
                                               Map<Long, TransitionGroup> groups,
                                               Map<Long, BusinessRole> roles,
                                               Map<Long, WorkflowPhase> phases,
                                               Map<Long, List<StepReviewDto>> reviews,
                                               Map<Long, String> flags,
                                               Map<Long, String> stepNames) {
        List<WorkflowStep> children = byParent.getOrDefault(parentKey, List.of()).stream()
                .sorted(Comparator.comparingInt(WorkflowStep::getOrderIndex))
                .toList();
        List<WorkflowStepDto> result = new ArrayList<>();
        for (WorkflowStep step : children) {
            result.add(toStepDto(step, byParent, byFrom, groups, roles, phases, reviews, flags, stepNames));
        }
        return result;
    }

    static WorkflowStepDto toStepDto(WorkflowStep step,
                                     Map<Long, List<WorkflowStep>> byParent,
                                     Map<Long, List<WorkflowTransition>> byFrom,
                                     Map<Long, TransitionGroup> groups,
                                     Map<Long, BusinessRole> roles,
                                     Map<Long, WorkflowPhase> phases,
                                     Map<Long, List<StepReviewDto>> reviews,
                                     Map<Long, String> flags,
                                     Map<Long, String> stepNames) {
        List<WorkflowStepDto> children = buildChildren(step.getId(), byParent, byFrom, groups, roles, phases, reviews, flags, stepNames);
        List<TransitionDto> transitions = byFrom.getOrDefault(step.getId(), List.of()).stream()
                .map(t -> {
                    TransitionGroup g = t.getGroupId() == null ? null : groups.get(t.getGroupId());
                    return new TransitionDto(t.getId(), t.getFromStepId(), t.getToStepId(),
                            stepNames.get(t.getToStepId()), g == null ? null : g.getLabel(), t.getOrderIndex(),
                            t.getGroupId(), g == null ? 0 : g.getOrderIndex(), t.getCoFireGroupId());
                })
                .sorted(Comparator.comparingInt(TransitionDto::groupOrderIndex).thenComparingInt(TransitionDto::orderIndex))
                .toList();
        List<BusinessRoleDto> roleDtos = step.getBusinessRoleIds().stream()
                .map(roles::get)
                .filter(Objects::nonNull)
                .map(WorkflowMapper::toRoleDto)
                .toList();
        WorkflowPhase phase = step.getPhaseId() == null ? null : phases.get(step.getPhaseId());
        return new WorkflowStepDto(step.getId(), step.getWorkflowId(), step.getParentId(), step.getOrderIndex(),
                step.getName(), step.getDescription(), step.getNotes(), step.getLineageKey(),
                roleDtos,
                phase == null ? null : WorkflowMapper.toPhaseDto(phase),
                reviews.getOrDefault(step.getId(), List.of()), children, transitions,
                flags.get(step.getId()));
    }
}
