package com.dsv.edinav.workflow;

import com.dsv.edinav.workflow.dto.WorkflowFolderDto;
import com.dsv.edinav.workflow.dto.WorkflowFolderRequest;
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
public class FolderController {

    private final WorkflowFolderService folderService;

    public FolderController(WorkflowFolderService folderService) {
        this.folderService = folderService;
    }

    @GetMapping("/folders")
    public List<WorkflowFolderDto> getFolders() {
        return folderService.getFolders();
    }

    @PostMapping("/folders")
    @PreAuthorize("hasRole('ADMIN')")
    public WorkflowFolderDto createFolder(@Valid @RequestBody WorkflowFolderRequest request) {
        return folderService.createFolder(request);
    }

    @PutMapping("/folders/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public WorkflowFolderDto updateFolder(@PathVariable Long id, @Valid @RequestBody WorkflowFolderRequest request) {
        return folderService.updateFolder(id, request);
    }

    @DeleteMapping("/folders/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteFolder(@PathVariable Long id) {
        folderService.deleteFolder(id);
    }
}
