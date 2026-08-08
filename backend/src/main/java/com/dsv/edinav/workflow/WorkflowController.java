package com.dsv.edinav.workflow;

import com.dsv.edinav.workflow.dto.AddMemberRequest;
import com.dsv.edinav.workflow.dto.BusinessRoleDto;
import com.dsv.edinav.workflow.dto.BusinessRoleRequest;
import com.dsv.edinav.workflow.dto.CreateStepRequest;
import com.dsv.edinav.workflow.dto.CreateTransitionRequest;
import com.dsv.edinav.workflow.dto.ImportWorkflowRequest;
import com.dsv.edinav.workflow.dto.TransitionDto;
import com.dsv.edinav.workflow.dto.UpdateStepRequest;
import com.dsv.edinav.workflow.dto.WorkflowCompositeDto;
import com.dsv.edinav.workflow.dto.WorkflowDto;
import com.dsv.edinav.workflow.dto.WorkflowLinkDto;
import com.dsv.edinav.workflow.dto.WorkflowLinkRequest;
import com.dsv.edinav.workflow.dto.WorkflowRequest;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/workflow")
public class WorkflowController {

    private final WorkflowService workflowService;

    public WorkflowController(WorkflowService workflowService) {
        this.workflowService = workflowService;
    }

    // ----- Workflow containers (sub-workflows / masters) -----

    @GetMapping("/workflows")
    public List<WorkflowDto> getWorkflows(@RequestParam(required = false) String type,
                                          @RequestParam(required = false) String status) {
        return workflowService.getWorkflows(type, status);
    }

    @GetMapping("/workflows/{id}")
    public WorkflowDto getWorkflow(@PathVariable Long id) {
        return workflowService.getWorkflow(id);
    }

    @GetMapping("/workflows/{id}/tree")
    public List<WorkflowStepDto> getWorkflowTree(@PathVariable Long id) {
        return workflowService.getTree(id);
    }

    @GetMapping("/steps")
    public List<WorkflowStepDto> getAllSteps() {
        return workflowService.getAllSteps();
    }

    @PostMapping("/workflows")
    @PreAuthorize("hasRole('ADMIN')")
    public WorkflowDto createWorkflow(@Valid @RequestBody WorkflowRequest request) {
        return workflowService.createWorkflow(request);
    }

    @PostMapping("/workflows/import")
    @PreAuthorize("hasRole('ADMIN')")
    public WorkflowDto importWorkflow(@Valid @RequestBody ImportWorkflowRequest request) {
        return workflowService.importWorkflow(request);
    }

    @PutMapping("/workflows/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public WorkflowDto updateWorkflow(@PathVariable Long id, @Valid @RequestBody WorkflowRequest request) {
        return workflowService.updateWorkflow(id, request);
    }

    @DeleteMapping("/workflows/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteWorkflow(@PathVariable Long id) {
        workflowService.deleteWorkflow(id);
    }

    // ----- Composition (master jigsaw: members + links) -----

    @GetMapping("/workflows/{id}/composite")
    public WorkflowCompositeDto getComposite(@PathVariable Long id) {
        return workflowService.getComposite(id);
    }

    @PostMapping("/workflows/{id}/members")
    @PreAuthorize("hasRole('ADMIN')")
    public WorkflowCompositeDto addMember(@PathVariable Long id, @Valid @RequestBody AddMemberRequest request) {
        return workflowService.addMember(id, request);
    }

    @DeleteMapping("/workflows/{id}/members/{subId}")
    @PreAuthorize("hasRole('ADMIN')")
    public WorkflowCompositeDto removeMember(@PathVariable Long id, @PathVariable Long subId) {
        return workflowService.removeMember(id, subId);
    }

    @PostMapping("/links")
    @PreAuthorize("hasRole('ADMIN')")
    public WorkflowLinkDto createLink(@Valid @RequestBody WorkflowLinkRequest request) {
        return workflowService.createLink(request);
    }

    @DeleteMapping("/links/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteLink(@PathVariable Long id) {
        workflowService.deleteLink(id);
    }

    // ----- Steps (scoped to a workflow) -----

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

    // ----- Transitions / branching -----

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

    // ----- Roles -----

    @GetMapping("/roles")
    public List<BusinessRoleDto> getRoles() {
        return workflowService.getRoles();
    }

    @GetMapping("/roles/{id}/steps")
    public List<WorkflowStepDto> getStepsByRole(@PathVariable Long id) {
        return workflowService.getStepsByRole(id);
    }

    @PostMapping("/roles")
    @PreAuthorize("hasRole('ADMIN')")
    public BusinessRoleDto createRole(@Valid @RequestBody BusinessRoleRequest request) {
        return workflowService.createRole(request);
    }

    @PutMapping("/roles/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public BusinessRoleDto updateRole(@PathVariable Long id, @Valid @RequestBody BusinessRoleRequest request) {
        return workflowService.updateRole(id, request);
    }

    @DeleteMapping("/roles/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteRole(@PathVariable Long id) {
        workflowService.deleteRole(id);
    }
}
