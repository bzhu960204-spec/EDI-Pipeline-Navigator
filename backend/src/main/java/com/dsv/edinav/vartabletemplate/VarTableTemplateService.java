package com.dsv.edinav.vartabletemplate;

import com.dsv.edinav.common.ApiException;
import com.dsv.edinav.security.CurrentUserService;
import com.dsv.edinav.vartabletemplate.dto.VarTableTemplateDto;
import com.dsv.edinav.vartabletemplate.dto.VarTableTemplateRequest;
import com.dsv.edinav.vartabletemplate.dto.VarTableTemplateSummaryDto;
import com.dsv.edinav.vartabletemplate.dto.VarTableTemplateTabDto;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

@Service
public class VarTableTemplateService {

    private final VarTableTemplateRepository repository;
    private final CurrentUserService currentUser;
    private final ObjectMapper objectMapper;

    public VarTableTemplateService(VarTableTemplateRepository repository,
                                   CurrentUserService currentUser,
                                   ObjectMapper objectMapper) {
        this.repository = repository;
        this.currentUser = currentUser;
        this.objectMapper = objectMapper;
    }

    // ---------------- Controller-facing (current user) ----------------

    @Transactional(readOnly = true)
    public List<VarTableTemplateSummaryDto> list() {
        return repository.findByOwnerIdOrderByNameAsc(currentUser.requireUserId()).stream()
                .map(this::toSummary).toList();
    }

    @Transactional(readOnly = true)
    public VarTableTemplateDto get(Long id) {
        return toDto(require(id));
    }

    @Transactional
    public VarTableTemplateDto create(VarTableTemplateRequest request, String username) {
        Long ownerId = currentUser.requireUserId();
        String name = requireName(request.name());
        repository.findFirstByOwnerIdAndNameIgnoreCase(ownerId, name).ifPresent(t -> {
            throw new ApiException(HttpStatus.CONFLICT, "A template with this name already exists");
        });
        VarTableTemplate template = new VarTableTemplate();
        template.setOwnerId(ownerId);
        template.setName(name);
        template.setDescription(trimToNull(request.description()));
        template.setContent(writeTabs(sanitize(request.tabs())));
        template.setCreatedBy(username);
        return toDto(repository.save(template));
    }

    @Transactional
    public VarTableTemplateDto update(Long id, VarTableTemplateRequest request, String username) {
        VarTableTemplate template = require(id);
        String name = requireName(request.name());
        repository.findFirstByOwnerIdAndNameIgnoreCaseAndIdNot(template.getOwnerId(), name, id).ifPresent(t -> {
            throw new ApiException(HttpStatus.CONFLICT, "A template with this name already exists");
        });
        template.setName(name);
        template.setDescription(trimToNull(request.description()));
        template.setContent(writeTabs(sanitize(request.tabs())));
        template.setUpdatedAt(Instant.now());
        template.setUpdatedBy(username);
        return toDto(repository.save(template));
    }

    @Transactional
    public void delete(Long id) {
        repository.delete(require(id));
    }

    // ---------------- Artifact integration (explicit owner) ----------------

    /** Returns the tabs of a template the given owner is allowed to read. */
    @Transactional(readOnly = true)
    public List<VarTableTemplateTabDto> resolveTabs(Long ownerId, Long templateId) {
        VarTableTemplate template = repository.findById(templateId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Template not found"));
        if (!template.getOwnerId().equals(ownerId)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Template does not belong to you");
        }
        return readTabs(template.getContent());
    }

    /** Creates a new template from tabs captured off an artifact. */
    @Transactional
    public VarTableTemplateDto createFrom(Long ownerId, String rawName, String description,
                                          List<VarTableTemplateTabDto> tabs, String username) {
        String name = requireName(rawName);
        repository.findFirstByOwnerIdAndNameIgnoreCase(ownerId, name).ifPresent(t -> {
            throw new ApiException(HttpStatus.CONFLICT, "A template with this name already exists");
        });
        VarTableTemplate template = new VarTableTemplate();
        template.setOwnerId(ownerId);
        template.setName(name);
        template.setDescription(trimToNull(description));
        template.setContent(writeTabs(sanitize(tabs)));
        template.setCreatedBy(username);
        return toDto(repository.save(template));
    }

    // ---------------- Helpers ----------------

    private VarTableTemplate require(Long id) {
        VarTableTemplate template = repository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Template not found"));
        if (!template.getOwnerId().equals(currentUser.requireUserId())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Template does not belong to you");
        }
        return template;
    }

    /** Drops blank tab names and duplicate/blank keys while preserving order. */
    private List<VarTableTemplateTabDto> sanitize(List<VarTableTemplateTabDto> tabs) {
        List<VarTableTemplateTabDto> result = new ArrayList<>();
        if (tabs == null) {
            return result;
        }
        for (VarTableTemplateTabDto tab : tabs) {
            if (tab == null || tab.name() == null || tab.name().isBlank()) {
                continue;
            }
            Set<String> seen = new LinkedHashSet<>();
            List<String> keys = new ArrayList<>();
            if (tab.keys() != null) {
                for (String key : tab.keys()) {
                    if (key == null || key.isBlank()) {
                        continue;
                    }
                    String trimmed = key.trim();
                    if (seen.add(trimmed.toLowerCase())) {
                        keys.add(trimmed);
                    }
                }
            }
            result.add(new VarTableTemplateTabDto(tab.name().trim(), keys));
        }
        return result;
    }

    private String writeTabs(List<VarTableTemplateTabDto> tabs) {
        try {
            return objectMapper.writeValueAsString(tabs);
        } catch (Exception e) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to serialize template");
        }
    }

    private List<VarTableTemplateTabDto> readTabs(String content) {
        if (content == null || content.isBlank()) {
            return List.of();
        }
        try {
            return objectMapper.readValue(content, new TypeReference<List<VarTableTemplateTabDto>>() {});
        } catch (Exception e) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to read template");
        }
    }

    private String requireName(String name) {
        if (name == null || name.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Template name is required");
        }
        return name.trim();
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private VarTableTemplateSummaryDto toSummary(VarTableTemplate template) {
        List<VarTableTemplateTabDto> tabs = readTabs(template.getContent());
        int keyCount = tabs.stream().mapToInt(t -> t.keys() == null ? 0 : t.keys().size()).sum();
        return new VarTableTemplateSummaryDto(template.getId(), template.getName(), template.getDescription(),
                tabs.size(), keyCount, template.getCreatedAt(), template.getUpdatedAt());
    }

    private VarTableTemplateDto toDto(VarTableTemplate template) {
        return new VarTableTemplateDto(template.getId(), template.getName(), template.getDescription(),
                readTabs(template.getContent()), template.getCreatedAt(), template.getCreatedBy(),
                template.getUpdatedAt(), template.getUpdatedBy());
    }
}
