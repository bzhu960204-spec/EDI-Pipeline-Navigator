package com.dsv.edinav.workflow;

import com.dsv.edinav.common.ApiException;
import com.dsv.edinav.security.CurrentUserService;
import com.dsv.edinav.workflow.dto.WorkflowFolderDto;
import com.dsv.edinav.workflow.dto.WorkflowFolderRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/** CRUD for workflow folders. Folder validation on workflow save lives in {@link WorkflowService}. */
@Service
public class WorkflowFolderService {

    private final WorkflowFolderRepository folderRepository;
    private final WorkflowRepository workflowRepository;
    private final CurrentUserService currentUser;

    public WorkflowFolderService(WorkflowFolderRepository folderRepository, WorkflowRepository workflowRepository,
                                 CurrentUserService currentUser) {
        this.folderRepository = folderRepository;
        this.workflowRepository = workflowRepository;
        this.currentUser = currentUser;
    }

    @Transactional(readOnly = true)
    public List<WorkflowFolderDto> getFolders() {
        return folderRepository.findByOwnerIdOrderByOrderIndexAscNameAsc(currentUser.requireUserId()).stream()
                .map(WorkflowMapper::toFolderDto).toList();
    }

    @Transactional
    public WorkflowFolderDto createFolder(WorkflowFolderRequest request) {
        Long ownerId = currentUser.requireUserId();
        if (folderRepository.existsByNameIgnoreCaseAndOwnerId(request.name().trim(), ownerId)) {
            throw new ApiException(HttpStatus.CONFLICT, "Folder name already exists");
        }
        WorkflowFolder folder = new WorkflowFolder();
        folder.setOwnerId(ownerId);
        folder.setName(request.name().trim());
        folder.setColor(request.color());
        folder.setDescription(request.description());
        folder.setOrderIndex(request.orderIndex() == null ? (int) folderRepository.countByOwnerId(ownerId) : request.orderIndex());
        return WorkflowMapper.toFolderDto(folderRepository.save(folder));
    }

    @Transactional
    public WorkflowFolderDto updateFolder(Long id, WorkflowFolderRequest request) {
        WorkflowFolder folder = requireOwnedFolder(id);
        if (folderRepository.existsByNameIgnoreCaseAndOwnerIdAndIdNot(request.name().trim(), folder.getOwnerId(), id)) {
            throw new ApiException(HttpStatus.CONFLICT, "Folder name already exists");
        }
        folder.setName(request.name().trim());
        folder.setColor(request.color());
        folder.setDescription(request.description());
        if (request.orderIndex() != null) {
            folder.setOrderIndex(request.orderIndex());
        }
        return WorkflowMapper.toFolderDto(folderRepository.save(folder));
    }

    @Transactional
    public void deleteFolder(Long id) {
        requireOwnedFolder(id);
        // Detach the folder from any workflow that references it, then delete (workflows are kept).
        workflowRepository.findAll().forEach(w -> {
            if (id.equals(w.getFolderId())) {
                w.setFolderId(null);
                workflowRepository.save(w);
            }
        });
        folderRepository.deleteById(id);
    }

    private WorkflowFolder requireOwnedFolder(Long id) {
        WorkflowFolder folder = folderRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Folder not found"));
        if (!folder.getOwnerId().equals(currentUser.requireUserId())) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Folder not found");
        }
        return folder;
    }
}
