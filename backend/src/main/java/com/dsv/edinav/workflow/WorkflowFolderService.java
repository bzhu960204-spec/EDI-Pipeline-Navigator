package com.dsv.edinav.workflow;

import com.dsv.edinav.common.ApiException;
import com.dsv.edinav.config.AppProperties;
import com.dsv.edinav.security.CurrentUserService;
import com.dsv.edinav.workflow.dto.WorkflowFolderDto;
import com.dsv.edinav.workflow.dto.WorkflowFolderRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/** CRUD for workflow folders. Folder validation on workflow save lives in {@link WorkflowService}. */
@Service
public class WorkflowFolderService {

    private final WorkflowFolderRepository folderRepository;
    private final WorkflowRepository workflowRepository;
    private final CurrentUserService currentUser;
    private final AppProperties appProperties;

    public WorkflowFolderService(WorkflowFolderRepository folderRepository, WorkflowRepository workflowRepository,
                                 CurrentUserService currentUser, AppProperties appProperties) {
        this.folderRepository = folderRepository;
        this.workflowRepository = workflowRepository;
        this.currentUser = currentUser;
        this.appProperties = appProperties;
    }

    @Transactional(readOnly = true)
    public List<WorkflowFolderDto> getFolders() {
        return folderRepository.findByOwnerIdOrderByOrderIndexAscNameAsc(currentUser.requireUserId()).stream()
                .map(WorkflowMapper::toFolderDto).toList();
    }

    @Transactional
    public WorkflowFolderDto createFolder(WorkflowFolderRequest request) {
        Long ownerId = currentUser.requireUserId();
        Long parentId = request.parentId();
        if (parentId != null) {
            requireOwnedFolder(parentId);
        }
        if (folderRepository.existsSiblingName(ownerId, request.name().trim(), parentId)) {
            throw new ApiException(HttpStatus.CONFLICT, "Folder name already exists in this location");
        }
        Map<Long, WorkflowFolder> byId = ownerFoldersById(ownerId);
        int parentLevel = parentId == null ? 0 : levelOf(parentId, byId);
        if (parentLevel + 1 > maxDepth()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Maximum folder nesting depth is " + maxDepth());
        }
        WorkflowFolder folder = new WorkflowFolder();
        folder.setOwnerId(ownerId);
        folder.setParentId(parentId);
        folder.setName(request.name().trim());
        folder.setColor(request.color());
        folder.setDescription(request.description());
        folder.setOrderIndex(request.orderIndex() == null ? (int) folderRepository.countByOwnerId(ownerId) : request.orderIndex());
        return WorkflowMapper.toFolderDto(folderRepository.save(folder));
    }

    @Transactional
    public WorkflowFolderDto updateFolder(Long id, WorkflowFolderRequest request) {
        WorkflowFolder folder = requireOwnedFolder(id);
        Long ownerId = folder.getOwnerId();
        Long parentId = request.parentId();
        if (parentId != null) {
            requireOwnedFolder(parentId);
        }
        if (folderRepository.existsSiblingNameExcludingId(ownerId, request.name().trim(), parentId, id)) {
            throw new ApiException(HttpStatus.CONFLICT, "Folder name already exists in this location");
        }
        Map<Long, WorkflowFolder> byId = ownerFoldersById(ownerId);
        if (parentId != null && isSelfOrDescendant(id, parentId, byId)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "A folder cannot be moved into itself or its own sub-folder");
        }
        int parentLevel = parentId == null ? 0 : levelOf(parentId, byId);
        if (parentLevel + subtreeHeight(id, byId) > maxDepth()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Maximum folder nesting depth is " + maxDepth());
        }
        folder.setParentId(parentId);
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
        if (!folderRepository.findByParentId(id).isEmpty()) {
            throw new ApiException(HttpStatus.CONFLICT, "Delete or move the sub-folders first");
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

    private int maxDepth() {
        return appProperties.getWorkflow().getFolderMaxDepth();
    }

    private Map<Long, WorkflowFolder> ownerFoldersById(Long ownerId) {
        return folderRepository.findByOwnerIdOrderByOrderIndexAscNameAsc(ownerId).stream()
                .collect(Collectors.toMap(WorkflowFolder::getId, Function.identity()));
    }

    /** Depth of a folder counting from the root: a top-level folder is level 1. */
    private int levelOf(Long folderId, Map<Long, WorkflowFolder> byId) {
        int level = 0;
        Long cursor = folderId;
        while (cursor != null) {
            WorkflowFolder f = byId.get(cursor);
            if (f == null) {
                break;
            }
            level++;
            cursor = f.getParentId();
        }
        return level;
    }

    /** Number of levels in the subtree rooted at the folder; a leaf folder has height 1. */
    private int subtreeHeight(Long folderId, Map<Long, WorkflowFolder> byId) {
        int max = 0;
        for (WorkflowFolder f : byId.values()) {
            if (folderId.equals(f.getParentId())) {
                max = Math.max(max, subtreeHeight(f.getId(), byId));
            }
        }
        return 1 + max;
    }

    /** True when {@code node} equals {@code root} or sits somewhere under it. */
    private boolean isSelfOrDescendant(Long root, Long node, Map<Long, WorkflowFolder> byId) {
        Long cursor = node;
        while (cursor != null) {
            if (cursor.equals(root)) {
                return true;
            }
            WorkflowFolder f = byId.get(cursor);
            cursor = f == null ? null : f.getParentId();
        }
        return false;
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
