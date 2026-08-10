package com.dsv.edinav.workflow;

import com.dsv.edinav.common.ApiException;
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

    public WorkflowFolderService(WorkflowFolderRepository folderRepository, WorkflowRepository workflowRepository) {
        this.folderRepository = folderRepository;
        this.workflowRepository = workflowRepository;
    }

    @Transactional(readOnly = true)
    public List<WorkflowFolderDto> getFolders() {
        return folderRepository.findAllByOrderByOrderIndexAscNameAsc().stream().map(WorkflowMapper::toFolderDto).toList();
    }

    @Transactional
    public WorkflowFolderDto createFolder(WorkflowFolderRequest request) {
        if (folderRepository.existsByNameIgnoreCase(request.name().trim())) {
            throw new ApiException(HttpStatus.CONFLICT, "Folder name already exists");
        }
        WorkflowFolder folder = new WorkflowFolder();
        folder.setName(request.name().trim());
        folder.setColor(request.color());
        folder.setDescription(request.description());
        folder.setOrderIndex(request.orderIndex() == null ? (int) folderRepository.count() : request.orderIndex());
        return WorkflowMapper.toFolderDto(folderRepository.save(folder));
    }

    @Transactional
    public WorkflowFolderDto updateFolder(Long id, WorkflowFolderRequest request) {
        WorkflowFolder folder = folderRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Folder not found"));
        if (folderRepository.existsByNameIgnoreCaseAndIdNot(request.name().trim(), id)) {
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
        if (!folderRepository.existsById(id)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Folder not found");
        }
        // Detach the folder from any workflow that references it, then delete (workflows are kept).
        workflowRepository.findAll().forEach(w -> {
            if (id.equals(w.getFolderId())) {
                w.setFolderId(null);
                workflowRepository.save(w);
            }
        });
        folderRepository.deleteById(id);
    }
}
