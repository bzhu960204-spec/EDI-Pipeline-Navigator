package com.dsv.edinav.workflow;

import com.dsv.edinav.workflow.dto.BusinessRoleDto;
import com.dsv.edinav.workflow.dto.BusinessRoleRequest;
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
public class RoleController {

    private final BusinessRoleService businessRoleService;
    private final WorkflowService workflowService;

    public RoleController(BusinessRoleService businessRoleService, WorkflowService workflowService) {
        this.businessRoleService = businessRoleService;
        this.workflowService = workflowService;
    }

    @GetMapping("/roles")
    public List<BusinessRoleDto> getRoles() {
        return businessRoleService.getRoles();
    }

    @GetMapping("/roles/{id}/steps")
    public List<WorkflowStepDto> getStepsByRole(@PathVariable Long id) {
        return workflowService.getStepsByRole(id);
    }

    @PostMapping("/roles")
    public BusinessRoleDto createRole(@Valid @RequestBody BusinessRoleRequest request) {
        return businessRoleService.createRole(request);
    }

    @PutMapping("/roles/{id}")
    public BusinessRoleDto updateRole(@PathVariable Long id, @Valid @RequestBody BusinessRoleRequest request) {
        return businessRoleService.updateRole(id, request);
    }

    @DeleteMapping("/roles/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteRole(@PathVariable Long id) {
        businessRoleService.deleteRole(id);
    }
}
