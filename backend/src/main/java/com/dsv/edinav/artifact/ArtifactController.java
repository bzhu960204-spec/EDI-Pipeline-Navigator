package com.dsv.edinav.artifact;

import com.dsv.edinav.artifact.dto.AdvanceRequest;
import com.dsv.edinav.artifact.dto.ArtifactDetailDto;
import com.dsv.edinav.artifact.dto.ArtifactNodeDto;
import com.dsv.edinav.artifact.dto.ArtifactSummaryDto;
import com.dsv.edinav.artifact.dto.CreateArtifactRequest;
import com.dsv.edinav.artifact.dto.CreateFolderRequest;
import com.dsv.edinav.artifact.dto.StatusHistoryDto;
import com.dsv.edinav.security.AppUserPrincipal;
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
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
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

    @GetMapping("/{id}")
    public ArtifactDetailDto get(@PathVariable Long id,
                                 @AuthenticationPrincipal AppUserPrincipal principal) {
        return artifactService.getDetail(principal.getId(), id);
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

    @GetMapping("/{id}/export")
    public ResponseEntity<StreamingResponseBody> export(@PathVariable Long id,
                                                        @AuthenticationPrincipal AppUserPrincipal principal) {
        ArtifactDetailDto artifact = artifactService.getDetail(principal.getId(), id);
        String fileName = (artifact.ediRef() != null && !artifact.ediRef().isBlank()
                ? artifact.ediRef() : artifact.name()).replaceAll("[\\\\/:*?\"<>|]", "_") + ".zip";
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
}
