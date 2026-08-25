package com.dsv.edinav.artifact;

import com.dsv.edinav.artifact.dto.ArtifactLogDto;
import com.dsv.edinav.artifact.dto.LogRequest;
import com.dsv.edinav.security.AppUserPrincipal;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
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
@RequestMapping("/api/artifacts/{artifactId}/logs")
public class ArtifactLogController {

    private final ArtifactService artifactService;

    public ArtifactLogController(ArtifactService artifactService) {
        this.artifactService = artifactService;
    }

    @GetMapping
    public List<ArtifactLogDto> list(@PathVariable Long artifactId,
                                     @AuthenticationPrincipal AppUserPrincipal principal) {
        return artifactService.listLogs(principal.getId(), artifactId);
    }

    @PostMapping
    public ArtifactLogDto create(@PathVariable Long artifactId,
                                 @RequestBody LogRequest request,
                                 @AuthenticationPrincipal AppUserPrincipal principal) {
        return artifactService.createLog(principal.getId(), artifactId, request);
    }

    @PutMapping("/{logId}")
    public ArtifactLogDto update(@PathVariable Long artifactId,
                                 @PathVariable Long logId,
                                 @RequestBody LogRequest request,
                                 @AuthenticationPrincipal AppUserPrincipal principal) {
        return artifactService.updateLog(principal.getId(), artifactId, logId, request);
    }

    @DeleteMapping("/{logId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long artifactId,
                       @PathVariable Long logId,
                       @AuthenticationPrincipal AppUserPrincipal principal) {
        artifactService.deleteLog(principal.getId(), artifactId, logId);
    }
}
