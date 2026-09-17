package com.dsv.edinav.artifact;

import com.dsv.edinav.artifact.dto.ApplyVarTemplateRequest;
import com.dsv.edinav.artifact.dto.ArtifactVarDto;
import com.dsv.edinav.artifact.dto.ArtifactVarTableDto;
import com.dsv.edinav.artifact.dto.ReorderRequest;
import com.dsv.edinav.artifact.dto.SaveVarTemplateRequest;
import com.dsv.edinav.artifact.dto.VarRequest;
import com.dsv.edinav.artifact.dto.VarTableRequest;
import com.dsv.edinav.security.AppUserPrincipal;
import com.dsv.edinav.vartabletemplate.dto.VarTableTemplateDto;
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
@RequestMapping("/api/artifacts/{artifactId}/var-tables")
public class ArtifactVarController {

    private final ArtifactService artifactService;

    public ArtifactVarController(ArtifactService artifactService) {
        this.artifactService = artifactService;
    }

    @GetMapping
    public List<ArtifactVarTableDto> listTables(@PathVariable Long artifactId,
                                                @AuthenticationPrincipal AppUserPrincipal principal) {
        return artifactService.listVarTables(principal.getId(), artifactId);
    }

    @PostMapping
    public ArtifactVarTableDto createTable(@PathVariable Long artifactId,
                                           @RequestBody VarTableRequest request,
                                           @AuthenticationPrincipal AppUserPrincipal principal) {
        return artifactService.createVarTable(principal.getId(), artifactId, request);
    }

    @PutMapping("/{tableId}")
    public ArtifactVarTableDto renameTable(@PathVariable Long artifactId,
                                           @PathVariable Long tableId,
                                           @RequestBody VarTableRequest request,
                                           @AuthenticationPrincipal AppUserPrincipal principal) {
        return artifactService.renameVarTable(principal.getId(), artifactId, tableId, request);
    }

    @DeleteMapping("/{tableId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteTable(@PathVariable Long artifactId,
                            @PathVariable Long tableId,
                            @AuthenticationPrincipal AppUserPrincipal principal) {
        artifactService.deleteVarTable(principal.getId(), artifactId, tableId);
    }

    @PutMapping("/reorder")
    public List<ArtifactVarTableDto> reorderTables(@PathVariable Long artifactId,
                                                   @RequestBody ReorderRequest request,
                                                   @AuthenticationPrincipal AppUserPrincipal principal) {
        return artifactService.reorderVarTables(principal.getId(), artifactId, request.orderedIds());
    }

    @PostMapping("/apply-template")
    public List<ArtifactVarTableDto> applyTemplate(@PathVariable Long artifactId,
                                                   @RequestBody ApplyVarTemplateRequest request,
                                                   @AuthenticationPrincipal AppUserPrincipal principal) {
        return artifactService.applyVarTemplate(principal.getId(), artifactId, request);
    }

    @PostMapping("/save-as-template")
    public VarTableTemplateDto saveAsTemplate(@PathVariable Long artifactId,
                                              @RequestBody SaveVarTemplateRequest request,
                                              @AuthenticationPrincipal AppUserPrincipal principal) {
        return artifactService.saveArtifactAsVarTemplate(principal.getId(), artifactId, request,
                principal.getUsername());
    }

    @PostMapping("/{tableId}/save-as-template")
    public VarTableTemplateDto saveTableAsTemplate(@PathVariable Long artifactId,
                                                   @PathVariable Long tableId,
                                                   @RequestBody SaveVarTemplateRequest request,
                                                   @AuthenticationPrincipal AppUserPrincipal principal) {
        return artifactService.saveVarTableAsTemplate(principal.getId(), artifactId, tableId, request,
                principal.getUsername());
    }

    @GetMapping("/{tableId}/vars")
    public List<ArtifactVarDto> listVars(@PathVariable Long artifactId,
                                         @PathVariable Long tableId,
                                         @AuthenticationPrincipal AppUserPrincipal principal) {
        return artifactService.listVars(principal.getId(), artifactId, tableId);
    }

    @PostMapping("/{tableId}/vars")
    public ArtifactVarDto createVar(@PathVariable Long artifactId,
                                    @PathVariable Long tableId,
                                    @RequestBody VarRequest request,
                                    @AuthenticationPrincipal AppUserPrincipal principal) {
        return artifactService.createVar(principal.getId(), artifactId, tableId, request);
    }

    @PutMapping("/{tableId}/vars/reorder")
    public List<ArtifactVarDto> reorderVars(@PathVariable Long artifactId,
                                            @PathVariable Long tableId,
                                            @RequestBody ReorderRequest request,
                                            @AuthenticationPrincipal AppUserPrincipal principal) {
        return artifactService.reorderVars(principal.getId(), artifactId, tableId, request.orderedIds());
    }

    @PutMapping("/{tableId}/vars/{varId}")
    public ArtifactVarDto updateVar(@PathVariable Long artifactId,
                                    @PathVariable Long tableId,
                                    @PathVariable Long varId,
                                    @RequestBody VarRequest request,
                                    @AuthenticationPrincipal AppUserPrincipal principal) {
        return artifactService.updateVar(principal.getId(), artifactId, tableId, varId, request);
    }

    @DeleteMapping("/{tableId}/vars/{varId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteVar(@PathVariable Long artifactId,
                          @PathVariable Long tableId,
                          @PathVariable Long varId,
                          @AuthenticationPrincipal AppUserPrincipal principal) {
        artifactService.deleteVar(principal.getId(), artifactId, tableId, varId);
    }
}
