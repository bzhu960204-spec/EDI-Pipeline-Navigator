package com.dsv.edinav.knowledge;

import com.dsv.edinav.knowledge.dto.CreateKnowledgeVersionRequest;
import com.dsv.edinav.knowledge.dto.ImportKnowledgeTreeRequest;
import com.dsv.edinav.knowledge.dto.KnowledgeTreeDto;
import com.dsv.edinav.knowledge.dto.KnowledgeTreeRequest;
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
@RequestMapping("/api/knowledge")
public class KnowledgeTreeController {

    private final KnowledgeTreeService treeService;
    private final KnowledgeImportExportService importExportService;

    public KnowledgeTreeController(KnowledgeTreeService treeService,
                                  KnowledgeImportExportService importExportService) {
        this.treeService = treeService;
        this.importExportService = importExportService;
    }

    @GetMapping("/trees")
    public List<KnowledgeTreeDto> getTrees() {
        return treeService.getTrees();
    }

    @GetMapping("/trees/{id}")
    public KnowledgeTreeDto getTree(@PathVariable Long id) {
        return treeService.getTree(id);
    }

    @GetMapping("/trees/{id}/versions")
    public List<KnowledgeTreeDto> getVersions(@PathVariable Long id) {
        return treeService.getVersions(id);
    }

    @PostMapping("/trees")
    public KnowledgeTreeDto createTree(@Valid @RequestBody KnowledgeTreeRequest request) {
        return treeService.createTree(request);
    }

    @PostMapping("/trees/import")
    public KnowledgeTreeDto importTree(@Valid @RequestBody ImportKnowledgeTreeRequest request) {
        return importExportService.importTree(request);
    }

    @GetMapping("/trees/{id}/export")
    public ImportKnowledgeTreeRequest exportTree(@PathVariable Long id) {
        return importExportService.exportTree(id);
    }

    @PutMapping("/trees/{id}/import")
    public KnowledgeTreeDto updateTreeFromImport(@PathVariable Long id,
                                                 @Valid @RequestBody ImportKnowledgeTreeRequest request) {
        return importExportService.updateTreeFromImport(id, request);
    }

    @PutMapping("/trees/{id}")
    public KnowledgeTreeDto updateTree(@PathVariable Long id, @Valid @RequestBody KnowledgeTreeRequest request) {
        return treeService.updateTree(id, request);
    }

    @PostMapping("/trees/{id}/versions")
    public KnowledgeTreeDto createVersion(@PathVariable Long id,
                                          @Valid @RequestBody CreateKnowledgeVersionRequest request) {
        return importExportService.createVersion(id, request);
    }

    @PutMapping("/trees/{id}/version-label")
    public KnowledgeTreeDto updateVersionLabel(@PathVariable Long id,
                                               @Valid @RequestBody CreateKnowledgeVersionRequest request) {
        return treeService.updateVersionLabel(id, request == null ? null : request.label());
    }

    @PostMapping("/trees/{id}/set-current")
    public KnowledgeTreeDto setCurrent(@PathVariable Long id) {
        return treeService.setCurrent(id);
    }

    @DeleteMapping("/trees/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteTree(@PathVariable Long id) {
        treeService.deleteTree(id);
    }
}
