package com.dsv.edinav.vartabletemplate;

import com.dsv.edinav.security.AppUserPrincipal;
import com.dsv.edinav.vartabletemplate.dto.VarTableTemplateDto;
import com.dsv.edinav.vartabletemplate.dto.VarTableTemplateRequest;
import com.dsv.edinav.vartabletemplate.dto.VarTableTemplateSummaryDto;
import jakarta.validation.Valid;
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
@RequestMapping("/api/var-table-templates")
public class VarTableTemplateController {

    private final VarTableTemplateService service;

    public VarTableTemplateController(VarTableTemplateService service) {
        this.service = service;
    }

    @GetMapping
    public List<VarTableTemplateSummaryDto> list() {
        return service.list();
    }

    @GetMapping("/{id}")
    public VarTableTemplateDto get(@PathVariable Long id) {
        return service.get(id);
    }

    @PostMapping
    public VarTableTemplateDto create(@Valid @RequestBody VarTableTemplateRequest request,
                                      @AuthenticationPrincipal AppUserPrincipal principal) {
        return service.create(request, principal.getUsername());
    }

    @PutMapping("/{id}")
    public VarTableTemplateDto update(@PathVariable Long id,
                                      @Valid @RequestBody VarTableTemplateRequest request,
                                      @AuthenticationPrincipal AppUserPrincipal principal) {
        return service.update(id, request, principal.getUsername());
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        service.delete(id);
    }
}
