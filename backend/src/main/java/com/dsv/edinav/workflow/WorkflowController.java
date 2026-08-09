package com.dsv.edinav.workflow;

import com.dsv.edinav.workflow.dto.BusinessRoleDto;
import com.dsv.edinav.workflow.dto.BusinessRoleRequest;
import com.dsv.edinav.workflow.dto.CreateStepRequest;
import com.dsv.edinav.workflow.dto.CreateTransitionRequest;
import com.dsv.edinav.workflow.dto.CreateVersionRequest;
import com.dsv.edinav.workflow.dto.ImportWorkflowRequest;
import com.dsv.edinav.workflow.dto.TransitionDto;
import com.dsv.edinav.workflow.dto.UpdateStepRequest;
import com.dsv.edinav.workflow.dto.WorkflowDto;
import com.dsv.edinav.workflow.dto.WorkflowPhaseDto;
import com.dsv.edinav.workflow.dto.WorkflowPhaseRequest;
import com.dsv.edinav.workflow.dto.WorkflowRequest;
import com.dsv.edinav.workflow.dto.WorkflowStepDto;
import com.dsv.edinav.workflow.dto.WorkflowTagDto;
import com.dsv.edinav.workflow.dto.WorkflowTagRequest;
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

    // ----- Workflow containers (versioned workflows) -----

    @GetMapping("/workflows")
    public List<WorkflowDto> getWorkflows() {
        return workflowService.getWorkflows();
    }

    @GetMapping("/workflows/{id}")
    public WorkflowDto getWorkflow(@PathVariable Long id) {
        return workflowService.getWorkflow(id);
    }

    @GetMapping("/workflows/{id}/versions")
    public List<WorkflowDto> getVersions(@PathVariable Long id) {
        return workflowService.getVersions(id);
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

    @GetMapping("/workflows/{id}/export")
    public ImportWorkflowRequest exportWorkflow(@PathVariable Long id,
                                                @RequestParam(defaultValue = "false") boolean includePhases) {
        return workflowService.exportWorkflow(id, includePhases);
    }

    @PutMapping("/workflows/{id}/import")
    @PreAuthorize("hasRole('ADMIN')")
    public WorkflowDto updateWorkflowFromImport(@PathVariable Long id,
                                                @Valid @RequestBody ImportWorkflowRequest request) {
        return workflowService.updateWorkflowFromImport(id, request);
    }

    @PutMapping("/workflows/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public WorkflowDto updateWorkflow(@PathVariable Long id, @Valid @RequestBody WorkflowRequest request) {
        return workflowService.updateWorkflow(id, request);
    }

    @PostMapping("/workflows/{id}/versions")
    @PreAuthorize("hasRole('ADMIN')")
    public WorkflowDto createVersion(@PathVariable Long id, @Valid @RequestBody CreateVersionRequest request) {
        return workflowService.createVersion(id, request);
    }

    @PutMapping("/workflows/{id}/version-label")
    @PreAuthorize("hasRole('ADMIN')")
    public WorkflowDto updateVersionLabel(@PathVariable Long id, @Valid @RequestBody CreateVersionRequest request) {
        return workflowService.updateVersionLabel(id, request == null ? null : request.label());
    }

    @PostMapping("/workflows/{id}/set-current")
    @PreAuthorize("hasRole('ADMIN')")
    public WorkflowDto setCurrent(@PathVariable Long id) {
        return workflowService.setCurrent(id);
    }

    @DeleteMapping("/workflows/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteWorkflow(@PathVariable Long id) {
        workflowService.deleteWorkflow(id);
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

    // ----- Phases (scoped to a workflow) -----

    @GetMapping("/workflows/{id}/phases")
    public List<WorkflowPhaseDto> getPhases(@PathVariable Long id) {
        return workflowService.getPhases(id);
    }

    @PostMapping("/workflows/{id}/phases")
    @PreAuthorize("hasRole('ADMIN')")
    public WorkflowPhaseDto createPhase(@PathVariable Long id, @Valid @RequestBody WorkflowPhaseRequest request) {
        return workflowService.createPhase(id, request);
    }

    @PutMapping("/phases/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public WorkflowPhaseDto updatePhase(@PathVariable Long id, @Valid @RequestBody WorkflowPhaseRequest request) {
        return workflowService.updatePhase(id, request);
    }

    @DeleteMapping("/phases/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deletePhase(@PathVariable Long id) {
        workflowService.deletePhase(id);
    }

    // ----- Tags -----

    @GetMapping("/tags")
    public List<WorkflowTagDto> getTags() {
        return workflowService.getTags();
    }

    @PostMapping("/tags")
    @PreAuthorize("hasRole('ADMIN')")
    public WorkflowTagDto createTag(@Valid @RequestBody WorkflowTagRequest request) {
        return workflowService.createTag(request);
    }

    @PutMapping("/tags/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public WorkflowTagDto updateTag(@PathVariable Long id, @Valid @RequestBody WorkflowTagRequest request) {
        return workflowService.updateTag(id, request);
    }

    @DeleteMapping("/tags/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteTag(@PathVariable Long id) {
        workflowService.deleteTag(id);
    }
}
