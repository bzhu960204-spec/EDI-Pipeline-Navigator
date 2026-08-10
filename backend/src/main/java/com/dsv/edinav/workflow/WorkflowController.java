package com.dsv.edinav.workflow;

import com.dsv.edinav.workflow.dto.CreateVersionRequest;
import com.dsv.edinav.workflow.dto.ImportWorkflowRequest;
import com.dsv.edinav.workflow.dto.WorkflowDto;
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
}
