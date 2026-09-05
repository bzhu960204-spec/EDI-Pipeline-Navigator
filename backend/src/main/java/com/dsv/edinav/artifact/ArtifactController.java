package com.dsv.edinav.artifact;

import com.dsv.edinav.artifact.dto.AdvanceRequest;
import com.dsv.edinav.artifact.dto.ArtifactDetailDto;
import com.dsv.edinav.artifact.dto.ArtifactNodeDto;
import com.dsv.edinav.artifact.dto.ArtifactSummaryDto;
import com.dsv.edinav.artifact.dto.ArtifactVersionDto;
import com.dsv.edinav.artifact.dto.AssignChecklistRequest;
import com.dsv.edinav.artifact.dto.ChecklistViewDto;
import com.dsv.edinav.artifact.dto.CreateArtifactRequest;
import com.dsv.edinav.artifact.dto.CreateChecklistItemRequest;
import com.dsv.edinav.artifact.dto.CreateFolderRequest;
import com.dsv.edinav.artifact.dto.CreateVersionRequest;
import com.dsv.edinav.artifact.dto.ImportAnalysisDto;
import com.dsv.edinav.artifact.dto.MoveNodeRequest;import com.dsv.edinav.artifact.dto.RenameNodeRequest;
import com.dsv.edinav.artifact.dto.SaveAsTemplateRequest;
import com.dsv.edinav.artifact.dto.StatusHistoryDto;
import com.dsv.edinav.artifact.dto.UpdateArtifactRequest;
import com.dsv.edinav.artifact.dto.UpdateChecklistItemRequest;
import com.dsv.edinav.artifact.dto.UpdateNotesRequest;
import com.dsv.edinav.artifact.dto.VersionDiffDto;
import com.dsv.edinav.security.AppUserPrincipal;
import com.dsv.edinav.template.dto.TemplateDto;
import jakarta.validation.Valid;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.nio.charset.StandardCharsets;
import java.util.List;

@RestController
@RequestMapping("/api/artifacts")
public class ArtifactController {

    private final ArtifactService artifactService;

    public ArtifactController(ArtifactService artifactService) {
        this.artifactService = artifactService;
    }

    @GetMapping
    public List<ArtifactSummaryDto> list(@AuthenticationPrincipal AppUserPrincipal principal) {
        return artifactService.listMine(principal.getId());
    }

    @PostMapping
    public ArtifactDetailDto create(@Valid @RequestBody CreateArtifactRequest request,
                                    @AuthenticationPrincipal AppUserPrincipal principal) {
        return artifactService.create(principal.getId(), request);
    }

    @PostMapping("/import/analyze")
    public ImportAnalysisDto analyzeImport(@RequestParam("file") MultipartFile file,
                                           @RequestParam(required = false) Long templateId,
                                           @AuthenticationPrincipal AppUserPrincipal principal) {
        return artifactService.analyzeImport(principal.getId(), file, templateId);
    }

    @GetMapping("/{id}")
    public ArtifactDetailDto get(@PathVariable Long id,
                                 @AuthenticationPrincipal AppUserPrincipal principal) {
        return artifactService.getDetail(principal.getId(), id);
    }

    @PatchMapping("/{id}")
    public ArtifactDetailDto update(@PathVariable Long id,
                                    @Valid @RequestBody UpdateArtifactRequest request,
                                    @AuthenticationPrincipal AppUserPrincipal principal) {
        return artifactService.updateArtifact(principal.getId(), id, request.name(), request.ediRef());
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id, @AuthenticationPrincipal AppUserPrincipal principal) {
        artifactService.delete(principal.getId(), id);
    }

    @PostMapping("/{id}/folders")
    public ArtifactNodeDto createFolder(@PathVariable Long id,
                                        @Valid @RequestBody CreateFolderRequest request,
                                        @AuthenticationPrincipal AppUserPrincipal principal) {
        return artifactService.createFolder(principal.getId(), id, request);
    }

    @PostMapping("/{id}/files")
    public ArtifactDetailDto upload(@PathVariable Long id,
                                    @RequestParam(required = false) Long folderId,
                                    @RequestParam("files") MultipartFile[] files,
                                    @AuthenticationPrincipal AppUserPrincipal principal) {
        artifactService.uploadFiles(principal.getId(), id, folderId, files);
        return artifactService.getDetail(principal.getId(), id);
    }

    @GetMapping("/{id}/nodes/{nodeId}/download")
    public ResponseEntity<InputStreamResource> download(@PathVariable Long id, @PathVariable Long nodeId,
                                                        @AuthenticationPrincipal AppUserPrincipal principal) {
        ArtifactNode node = artifactService.getDownloadNode(principal.getId(), id, nodeId);
        InputStreamResource resource = new InputStreamResource(
                artifactService.openFile(principal.getId(), id, nodeId));
        MediaType mediaType = node.getContentType() != null
                ? MediaType.parseMediaType(node.getContentType())
                : MediaType.APPLICATION_OCTET_STREAM;
        ContentDisposition disposition = ContentDisposition.attachment().filename(node.getName(), StandardCharsets.UTF_8).build();
        return ResponseEntity.ok()
                .contentType(mediaType)
                .contentLength(node.getSizeBytes())
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .body(resource);
    }

    @DeleteMapping("/{id}/nodes/{nodeId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteNode(@PathVariable Long id, @PathVariable Long nodeId,
                           @AuthenticationPrincipal AppUserPrincipal principal) {
        artifactService.deleteNode(principal.getId(), id, nodeId);
    }

    @PatchMapping("/{id}/nodes/{nodeId}/rename")
    public ArtifactDetailDto renameNode(@PathVariable Long id, @PathVariable Long nodeId,
                                        @Valid @RequestBody RenameNodeRequest request,
                                        @AuthenticationPrincipal AppUserPrincipal principal) {
        return artifactService.renameNode(principal.getId(), id, nodeId, request.name());
    }

    @PatchMapping("/{id}/nodes/{nodeId}/notes")
    public ArtifactDetailDto updateNotes(@PathVariable Long id, @PathVariable Long nodeId,
                                         @Valid @RequestBody UpdateNotesRequest request,
                                         @AuthenticationPrincipal AppUserPrincipal principal) {
        return artifactService.updateNotes(principal.getId(), id, nodeId, request.notes());
    }

    @PatchMapping("/{id}/nodes/{nodeId}/move")
    public ArtifactDetailDto moveNode(@PathVariable Long id, @PathVariable Long nodeId,
                                      @RequestBody MoveNodeRequest request,
                                      @AuthenticationPrincipal AppUserPrincipal principal) {
        return artifactService.moveNode(principal.getId(), id, nodeId, request.parentId());
    }

    @GetMapping("/{id}/export")
    public ResponseEntity<StreamingResponseBody> export(@PathVariable Long id,
                                                        @AuthenticationPrincipal AppUserPrincipal principal) {
        ArtifactDetailDto artifact = artifactService.getDetail(principal.getId(), id);
        String fileName = artifact.name().replaceAll("[\\\\/:*?\"<>|]", "_") + ".zip";
        StreamingResponseBody body = out -> artifactService.exportZip(principal.getId(), id, out);
        ContentDisposition disposition = ContentDisposition.attachment().filename(fileName, StandardCharsets.UTF_8).build();
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("application/zip"))
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .body(body);
    }

    @PostMapping("/{id}/advance")
    public ArtifactDetailDto advance(@PathVariable Long id, @Valid @RequestBody AdvanceRequest request,
                                     @AuthenticationPrincipal AppUserPrincipal principal) {
        return artifactService.advance(principal.getId(), id, request.toStepId(), request.comment());
    }

    @GetMapping("/{id}/history")
    public List<StatusHistoryDto> history(@PathVariable Long id,
                                          @AuthenticationPrincipal AppUserPrincipal principal) {
        return artifactService.getHistory(principal.getId(), id);
    }

    @GetMapping("/{id}/checklist")
    public ChecklistViewDto checklist(@PathVariable Long id,
                                      @AuthenticationPrincipal AppUserPrincipal principal) {
        return artifactService.getChecklist(principal.getId(), id);
    }

    @PostMapping("/{id}/checklist")
    public ChecklistViewDto createChecklistItem(@PathVariable Long id,
                                                @Valid @RequestBody CreateChecklistItemRequest request,
                                                @AuthenticationPrincipal AppUserPrincipal principal) {
        return artifactService.createChecklistItem(principal.getId(), id, request);
    }

    @PatchMapping("/{id}/checklist/{itemId}")
    public ChecklistViewDto updateChecklistItem(@PathVariable Long id, @PathVariable Long itemId,
                                                @Valid @RequestBody UpdateChecklistItemRequest request,
                                                @AuthenticationPrincipal AppUserPrincipal principal) {
        return artifactService.updateChecklistItem(principal.getId(), id, itemId, request);
    }

    @PutMapping("/{id}/checklist/{itemId}/assignment")
    public ChecklistViewDto assignChecklistItem(@PathVariable Long id, @PathVariable Long itemId,
                                                @RequestBody AssignChecklistRequest request,
                                                @AuthenticationPrincipal AppUserPrincipal principal) {
        return artifactService.assignChecklistItem(principal.getId(), id, itemId, request.nodeId());
    }

    @DeleteMapping("/{id}/checklist/{itemId}")
    public ChecklistViewDto deleteChecklistItem(@PathVariable Long id, @PathVariable Long itemId,
                                                @AuthenticationPrincipal AppUserPrincipal principal) {
        return artifactService.deleteChecklistItem(principal.getId(), id, itemId);
    }

    @PostMapping("/{id}/save-as-template")
    public TemplateDto saveAsTemplate(@PathVariable Long id,
                                      @Valid @RequestBody SaveAsTemplateRequest request,
                                      @AuthenticationPrincipal AppUserPrincipal principal) {
        return artifactService.saveAsTemplate(principal.getId(), id, request);
    }

    @PostMapping("/{id}/versions/analyze")
    public VersionDiffDto analyzeVersionUpload(@PathVariable Long id,
                                               @RequestParam("file") MultipartFile file,
                                               @AuthenticationPrincipal AppUserPrincipal principal) {
        return artifactService.analyzeVersionUpload(principal.getId(), id, file);
    }

    @PostMapping("/{id}/versions")
    public ArtifactDetailDto createVersion(@PathVariable Long id,
                                           @RequestBody CreateVersionRequest request,
                                           @AuthenticationPrincipal AppUserPrincipal principal) {
        return artifactService.createVersion(principal.getId(), id, request.token(), request.comment());
    }

    @GetMapping("/{id}/versions")
    public List<ArtifactVersionDto> listVersions(@PathVariable Long id,
                                                 @AuthenticationPrincipal AppUserPrincipal principal) {
        return artifactService.listVersions(principal.getId(), id);
    }

    @GetMapping("/{id}/versions/{versionId}")
    public ArtifactDetailDto getVersionDetail(@PathVariable Long id, @PathVariable Long versionId,
                                              @AuthenticationPrincipal AppUserPrincipal principal) {
        return artifactService.getVersionDetail(principal.getId(), id, versionId);
    }

    @PostMapping("/{id}/versions/{versionId}/set-current")
    public ArtifactDetailDto setCurrentVersion(@PathVariable Long id, @PathVariable Long versionId,
                                               @AuthenticationPrincipal AppUserPrincipal principal) {
        return artifactService.setCurrentVersion(principal.getId(), id, versionId);
    }

    @DeleteMapping("/{id}/versions/{versionId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteVersion(@PathVariable Long id, @PathVariable Long versionId,
                              @AuthenticationPrincipal AppUserPrincipal principal) {
        artifactService.deleteVersion(principal.getId(), id, versionId);
    }

    @GetMapping("/{id}/versions/{versionId}/export")
    public ResponseEntity<StreamingResponseBody> exportVersion(@PathVariable Long id, @PathVariable Long versionId,
                                                               @AuthenticationPrincipal AppUserPrincipal principal) {
        ArtifactDetailDto version = artifactService.getVersionDetail(principal.getId(), id, versionId);
        String fileName = version.name().replaceAll("[\\\\/:*?\"<>|]", "_") + "-v" + version.versionNumber() + ".zip";
        StreamingResponseBody body = out -> artifactService.exportVersionZip(principal.getId(), id, versionId, out);
        ContentDisposition disposition = ContentDisposition.attachment().filename(fileName, StandardCharsets.UTF_8).build();
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("application/zip"))
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .body(body);
    }
}
