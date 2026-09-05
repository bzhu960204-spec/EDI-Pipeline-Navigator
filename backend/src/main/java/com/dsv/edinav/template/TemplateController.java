package com.dsv.edinav.template;

import com.dsv.edinav.security.AppUserPrincipal;
import com.dsv.edinav.template.dto.TemplateDto;
import com.dsv.edinav.template.dto.TemplateRequest;
import com.dsv.edinav.template.dto.TemplateSummaryDto;
import jakarta.validation.Valid;
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
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.nio.charset.StandardCharsets;
import java.util.List;

@RestController
@RequestMapping("/api/templates")
public class TemplateController {

    private final TemplateService templateService;

    public TemplateController(TemplateService templateService) {
        this.templateService = templateService;
    }

    @GetMapping
    public List<TemplateSummaryDto> list() {
        return templateService.list();
    }

    @GetMapping("/{id}")
    public TemplateDto get(@PathVariable Long id) {
        return templateService.get(id);
    }

    @PostMapping
    public TemplateDto create(@Valid @RequestBody TemplateRequest request,
                              @AuthenticationPrincipal AppUserPrincipal principal) {
        return templateService.create(request, principal.getId());
    }

    @PostMapping("/import")
    public TemplateDto importTemplate(@Valid @RequestBody TemplateRequest request,
                                      @AuthenticationPrincipal AppUserPrincipal principal) {
        return templateService.importNew(request, principal.getId());
    }

    @GetMapping("/{id}/export")
    public TemplateRequest export(@PathVariable Long id) {
        return templateService.export(id);
    }

    @GetMapping("/{id}/skeleton")
    public ResponseEntity<StreamingResponseBody> skeleton(@PathVariable Long id) {
        TemplateDto template = templateService.get(id);
        String fileName = template.name().replaceAll("[\\\\/:*?\"<>|]", "_") + ".zip";
        StreamingResponseBody body = out -> templateService.exportSkeletonZip(id, out);
        ContentDisposition disposition = ContentDisposition.attachment().filename(fileName, StandardCharsets.UTF_8).build();
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("application/zip"))
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .body(body);
    }

    @PutMapping("/{id}/import")
    public TemplateDto updateFromImport(@PathVariable Long id, @Valid @RequestBody TemplateRequest request) {
        return templateService.importUpdate(id, request);
    }

    @PutMapping("/{id}")
    public TemplateDto update(@PathVariable Long id, @Valid @RequestBody TemplateRequest request) {
        return templateService.update(id, request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        templateService.delete(id);
    }
}
