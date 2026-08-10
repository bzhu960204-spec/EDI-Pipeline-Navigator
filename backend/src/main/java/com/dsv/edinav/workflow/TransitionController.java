package com.dsv.edinav.workflow;

import com.dsv.edinav.workflow.dto.CreateTransitionRequest;
import com.dsv.edinav.workflow.dto.TransitionDto;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/workflow")
public class TransitionController {

    private final WorkflowService workflowService;

    public TransitionController(WorkflowService workflowService) {
        this.workflowService = workflowService;
    }

    @PostMapping("/transitions")
    @PreAuthorize("hasRole('ADMIN')")
    public TransitionDto createTransition(@Valid @RequestBody CreateTransitionRequest request) {
        return workflowService.createTransition(request);
    }

    @DeleteMapping("/transitions/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteTransition(@PathVariable Long id) {
        workflowService.deleteTransition(id);
    }
}
