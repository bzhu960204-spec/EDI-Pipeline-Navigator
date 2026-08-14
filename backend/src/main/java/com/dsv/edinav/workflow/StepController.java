package com.dsv.edinav.workflow;

import com.dsv.edinav.workflow.dto.CreateStepRequest;
import com.dsv.edinav.workflow.dto.FlagRequest;
import com.dsv.edinav.workflow.dto.ReviewRequest;
import com.dsv.edinav.workflow.dto.StepReviewDto;
import com.dsv.edinav.workflow.dto.UpdateStepRequest;
import com.dsv.edinav.workflow.dto.WorkflowStepDto;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/workflow")
public class StepController {

    private final WorkflowService workflowService;

    public StepController(WorkflowService workflowService) {
        this.workflowService = workflowService;
    }

    @GetMapping("/steps")
    public List<WorkflowStepDto> getAllSteps() {
        return workflowService.getAllSteps();
    }

    @PostMapping("/steps")
    public WorkflowStepDto createStep(@Valid @RequestBody CreateStepRequest request) {
        return workflowService.createStep(request);
    }

    @PutMapping("/steps/{id}")
    public WorkflowStepDto updateStep(@PathVariable Long id, @Valid @RequestBody UpdateStepRequest request) {
        return workflowService.updateStep(id, request);
    }

    @DeleteMapping("/steps/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteStep(@PathVariable Long id) {
        workflowService.deleteStep(id);
    }

    // Personal importance flag; not tied to ADMIN and never part of import/export.
    @PutMapping("/steps/{id}/flag")
    public WorkflowStepDto setStepFlag(@PathVariable Long id, @Valid @RequestBody FlagRequest request) {
        return workflowService.setStepFlag(id, request == null ? null : request.level());
    }

    @PostMapping("/steps/{id}/reviews")
    public StepReviewDto addReview(@PathVariable Long id, @Valid @RequestBody ReviewRequest request) {
        return workflowService.addReview(id, request);
    }

    @PutMapping("/reviews/{id}")
    public StepReviewDto updateReview(@PathVariable Long id, @Valid @RequestBody ReviewRequest request) {
        return workflowService.updateReview(id, request);
    }

    @DeleteMapping("/reviews/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteReview(@PathVariable Long id) {
        workflowService.deleteReview(id);
    }
}
