package com.dsv.edinav.workflow;

import com.dsv.edinav.workflow.dto.CreateStepRequest;
import com.dsv.edinav.workflow.dto.ReviewRequest;
import com.dsv.edinav.workflow.dto.StepReviewDto;
import com.dsv.edinav.workflow.dto.UpdateStepRequest;
import com.dsv.edinav.workflow.dto.WorkflowStepDto;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
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
    @PreAuthorize("hasRole('ADMIN')")
    public WorkflowStepDto createStep(@Valid @RequestBody CreateStepRequest request) {
        return workflowService.createStep(request);
    }

    @PutMapping("/steps/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public WorkflowStepDto updateStep(@PathVariable Long id, @Valid @RequestBody UpdateStepRequest request) {
        return workflowService.updateStep(id, request);
    }

    @DeleteMapping("/steps/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteStep(@PathVariable Long id) {
        workflowService.deleteStep(id);
    }

    @PostMapping("/steps/{id}/reviews")
    @PreAuthorize("hasRole('ADMIN')")
    public StepReviewDto addReview(@PathVariable Long id, @Valid @RequestBody ReviewRequest request) {
        return workflowService.addReview(id, request);
    }

    @PutMapping("/reviews/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public StepReviewDto updateReview(@PathVariable Long id, @Valid @RequestBody ReviewRequest request) {
        return workflowService.updateReview(id, request);
    }

    @DeleteMapping("/reviews/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteReview(@PathVariable Long id) {
        workflowService.deleteReview(id);
    }
}
