package com.dsv.edinav.workflow;

import com.dsv.edinav.workflow.dto.CoFireGroupRequest;
import com.dsv.edinav.workflow.dto.CreateTransitionGroupRequest;
import com.dsv.edinav.workflow.dto.CreateTransitionRequest;
import com.dsv.edinav.workflow.dto.TransitionDto;
import com.dsv.edinav.workflow.dto.UpdateTransitionGroupRequest;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
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
    public TransitionDto createTransition(@Valid @RequestBody CreateTransitionRequest request) {
        return workflowService.createTransition(request);
    }

    @DeleteMapping("/transitions/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteTransition(@PathVariable Long id) {
        workflowService.deleteTransition(id);
    }

    @PostMapping("/transition-groups")
    public List<TransitionDto> createTransitionGroup(@Valid @RequestBody CreateTransitionGroupRequest request) {
        return workflowService.createTransitionGroup(request);
    }

    @PutMapping("/transition-groups/{id}")
    public List<TransitionDto> updateTransitionGroup(@PathVariable Long id,
                                                     @Valid @RequestBody UpdateTransitionGroupRequest request) {
        return workflowService.updateTransitionGroup(id, request);
    }

    @PostMapping("/cofire-groups")
    public List<TransitionDto> createCoFireGroup(@Valid @RequestBody CoFireGroupRequest request) {
        return workflowService.createCoFireGroup(request);
    }

    @PutMapping("/cofire-groups/{id}")
    public List<TransitionDto> updateCoFireGroup(@PathVariable Long id,
                                                 @Valid @RequestBody CoFireGroupRequest request) {
        return workflowService.updateCoFireGroup(id, request);
    }

    @DeleteMapping("/cofire-groups/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteCoFireGroup(@PathVariable Long id) {
        workflowService.deleteCoFireGroup(id);
    }
}
