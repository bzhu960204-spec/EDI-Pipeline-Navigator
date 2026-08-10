package com.dsv.edinav.workflow;

import com.dsv.edinav.workflow.dto.WorkflowPhaseDto;
import com.dsv.edinav.workflow.dto.WorkflowPhaseRequest;
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
public class PhaseController {

    private final WorkflowPhaseService phaseService;

    public PhaseController(WorkflowPhaseService phaseService) {
        this.phaseService = phaseService;
    }

    @GetMapping("/workflows/{id}/phases")
    public List<WorkflowPhaseDto> getPhases(@PathVariable Long id) {
        return phaseService.getPhases(id);
    }

    @PostMapping("/workflows/{id}/phases")
    @PreAuthorize("hasRole('ADMIN')")
    public WorkflowPhaseDto createPhase(@PathVariable Long id, @Valid @RequestBody WorkflowPhaseRequest request) {
        return phaseService.createPhase(id, request);
    }

    @PutMapping("/phases/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public WorkflowPhaseDto updatePhase(@PathVariable Long id, @Valid @RequestBody WorkflowPhaseRequest request) {
        return phaseService.updatePhase(id, request);
    }

    @DeleteMapping("/phases/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deletePhase(@PathVariable Long id) {
        phaseService.deletePhase(id);
    }
}
