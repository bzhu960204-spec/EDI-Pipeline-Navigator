package com.dsv.edinav.template;

import com.dsv.edinav.security.AppUserPrincipal;
import com.dsv.edinav.template.dto.TemplateDto;
import com.dsv.edinav.template.dto.TemplateRequest;
import com.dsv.edinav.template.dto.TemplateSummaryDto;
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
    @PreAuthorize("hasRole('ADMIN')")
    public TemplateDto create(@Valid @RequestBody TemplateRequest request,
                              @AuthenticationPrincipal AppUserPrincipal principal) {
        return templateService.create(request, principal.getId());
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public TemplateDto update(@PathVariable Long id, @Valid @RequestBody TemplateRequest request) {
        return templateService.update(id, request);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        templateService.delete(id);
    }
}
