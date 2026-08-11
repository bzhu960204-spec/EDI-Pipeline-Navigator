package com.dsv.edinav.schematemplate;

import com.dsv.edinav.schematemplate.dto.CreateSchemaTemplateRequest;
import com.dsv.edinav.schematemplate.dto.CreateTemplateVersionRequest;
import com.dsv.edinav.schematemplate.dto.SchemaTemplateDto;
import com.dsv.edinav.schematemplate.dto.SchemaTemplateSummaryDto;
import com.dsv.edinav.schematemplate.dto.UpdateTemplateMetadataRequest;
import com.dsv.edinav.security.AppUserPrincipal;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
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
@RequestMapping("/api/schema-templates")
public class SchemaTemplateController {

    private final SchemaTemplateService service;

    public SchemaTemplateController(SchemaTemplateService service) {
        this.service = service;
    }

    @GetMapping
    public List<SchemaTemplateSummaryDto> list() {
        return service.list();
    }

    @GetMapping("/{id}")
    public SchemaTemplateDto get(@PathVariable Long id) {
        return service.get(id);
    }

    @GetMapping("/{id}/versions")
    public List<SchemaTemplateDto> versions(@PathVariable Long id) {
        return service.getVersions(id);
    }

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    public SchemaTemplateDto create(@Valid @RequestBody CreateSchemaTemplateRequest request,
                                    @AuthenticationPrincipal AppUserPrincipal principal) {
        return service.create(request, principal.getUsername());
    }

    @PostMapping("/{id}/versions")
    @PreAuthorize("hasRole('ADMIN')")
    public SchemaTemplateDto createVersion(@PathVariable Long id,
                                           @Valid @RequestBody CreateTemplateVersionRequest request,
                                           @AuthenticationPrincipal AppUserPrincipal principal) {
        return service.createVersion(id, request, principal.getUsername());
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public SchemaTemplateDto update(@PathVariable Long id,
                                    @Valid @RequestBody UpdateTemplateMetadataRequest request,
                                    @AuthenticationPrincipal AppUserPrincipal principal) {
        return service.updateMetadata(id, request, principal.getUsername());
    }

    @PutMapping("/{id}/current")
    @PreAuthorize("hasRole('ADMIN')")
    public SchemaTemplateDto setCurrent(@PathVariable Long id) {
        return service.setCurrent(id);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        service.delete(id);
    }
}
