package com.dsv.edinav.workflow;

import com.dsv.edinav.common.ApiException;
import com.dsv.edinav.security.CurrentUserService;
import com.dsv.edinav.workflow.dto.BusinessRoleDto;
import com.dsv.edinav.workflow.dto.BusinessRoleRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/** CRUD for business roles. Role resolution used during import lives in {@link WorkflowService}. */
@Service
public class BusinessRoleService {

    private final BusinessRoleRepository roleRepository;
    private final WorkflowStepRepository stepRepository;
    private final CurrentUserService currentUser;

    public BusinessRoleService(BusinessRoleRepository roleRepository, WorkflowStepRepository stepRepository,
                               CurrentUserService currentUser) {
        this.roleRepository = roleRepository;
        this.stepRepository = stepRepository;
        this.currentUser = currentUser;
    }

    @Transactional(readOnly = true)
    public List<BusinessRoleDto> getRoles() {
        return roleRepository.findByOwnerIdOrderByNameAsc(currentUser.requireUserId()).stream()
                .map(WorkflowMapper::toRoleDto).toList();
    }

    @Transactional
    public BusinessRoleDto createRole(BusinessRoleRequest request) {
        Long ownerId = currentUser.requireUserId();
        if (roleRepository.existsByNameIgnoreCaseAndOwnerId(request.name().trim(), ownerId)) {
            throw new ApiException(HttpStatus.CONFLICT, "Role name already exists");
        }
        BusinessRole role = new BusinessRole();
        role.setOwnerId(ownerId);
        role.setName(request.name().trim());
        role.setColor(request.color());
        role.setDescription(request.description());
        return WorkflowMapper.toRoleDto(roleRepository.save(role));
    }

    @Transactional
    public BusinessRoleDto updateRole(Long id, BusinessRoleRequest request) {
        BusinessRole role = requireOwnedRole(id);
        role.setName(request.name().trim());
        role.setColor(request.color());
        role.setDescription(request.description());
        return WorkflowMapper.toRoleDto(roleRepository.save(role));
    }

    @Transactional
    public void deleteRole(Long id) {
        requireOwnedRole(id);
        // Detach the role from any steps that reference it, then delete.
        stepRepository.findByBusinessRoleIdOrderByOrderIndexAsc(id).forEach(step -> {
            step.getBusinessRoleIds().remove(id);
            stepRepository.save(step);
        });
        roleRepository.deleteById(id);
    }

    private BusinessRole requireOwnedRole(Long id) {
        BusinessRole role = roleRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Role not found"));
        if (!role.getOwnerId().equals(currentUser.requireUserId())) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Role not found");
        }
        return role;
    }
}
