package com.dsv.edinav.schematemplate;

import com.dsv.edinav.common.ApiException;
import com.dsv.edinav.schematemplate.dto.CreateSchemaTemplateRequest;
import com.dsv.edinav.schematemplate.dto.CreateTemplateVersionRequest;
import com.dsv.edinav.schematemplate.dto.SchemaTemplateDto;
import com.dsv.edinav.schematemplate.dto.SchemaTemplateSummaryDto;
import com.dsv.edinav.schematemplate.dto.UpdateTemplateMetadataRequest;
import com.dsv.edinav.workflow.dto.ImportWorkflowRequest;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;

@Service
public class SchemaTemplateService {

    private final SchemaTemplateRepository repository;

    /** Lenient reader for advisory validation: tolerates jsonc comments/trailing commas and unknown fields. */
    private final ObjectMapper validator;

    public SchemaTemplateService(SchemaTemplateRepository repository, ObjectMapper objectMapper) {
        this.repository = repository;
        this.validator = objectMapper.copy()
                .configure(JsonParser.Feature.ALLOW_COMMENTS, true)
                .configure(JsonParser.Feature.ALLOW_TRAILING_COMMA, true)
                .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
    }

    // ---------------- Reads ----------------

    @Transactional(readOnly = true)
    public List<SchemaTemplateSummaryDto> list() {
        return repository.findByIsCurrentTrueOrderByNameAsc().stream()
                .map(this::toSummary).toList();
    }

    @Transactional(readOnly = true)
    public SchemaTemplateDto get(Long id) {
        return toDto(require(id));
    }

    /** Every version of the group the given id belongs to, oldest first. */
    @Transactional(readOnly = true)
    public List<SchemaTemplateDto> getVersions(Long id) {
        SchemaTemplate template = require(id);
        return repository.findByGroupIdOrderByCreatedAtAsc(template.getGroupId()).stream()
                .map(this::toDto).toList();
    }

    // ---------------- Writes ----------------

    @Transactional
    public SchemaTemplateDto create(CreateSchemaTemplateRequest request, String username) {
        String name = request.name().trim();
        repository.findFirstByNameIgnoreCase(name).ifPresent(t -> {
            throw new ApiException(HttpStatus.CONFLICT, "A template with this name already exists");
        });
        SchemaTemplate template = new SchemaTemplate();
        template.setName(name);
        template.setDescription(request.description());
        template.setVersion(defaultVersion(request.version()));
        template.setVersionLabel(request.versionLabel());
        template.setContent(request.content());
        template.setChangeNotes(request.changeNotes());
        template.setCurrent(true);
        template.setCreatedBy(username);
        SchemaTemplate saved = repository.save(template);
        saved.setGroupId(saved.getId());
        return toDto(repository.save(saved));
    }

    @Transactional
    public SchemaTemplateDto createVersion(Long id, CreateTemplateVersionRequest request, String username) {
        SchemaTemplate base = require(id);
        String version = request.version().trim();
        if (repository.existsByGroupIdAndVersionIgnoreCase(base.getGroupId(), version)) {
            throw new ApiException(HttpStatus.CONFLICT, "Version '" + version + "' already exists for this template");
        }
        List<SchemaTemplate> group = repository.findByGroupIdOrderByCreatedAtAsc(base.getGroupId());
        group.forEach(t -> t.setCurrent(false));
        repository.saveAll(group);

        SchemaTemplate next = new SchemaTemplate();
        next.setGroupId(base.getGroupId());
        next.setName(base.getName());
        next.setDescription(request.description() != null ? request.description() : base.getDescription());
        next.setVersion(version);
        next.setVersionLabel(request.versionLabel());
        next.setContent(request.content());
        next.setChangeNotes(request.changeNotes());
        next.setCurrent(true);
        next.setCreatedBy(username);
        return toDto(repository.save(next));
    }

    @Transactional
    public SchemaTemplateDto setCurrent(Long id) {
        SchemaTemplate target = require(id);
        List<SchemaTemplate> group = repository.findByGroupIdOrderByCreatedAtAsc(target.getGroupId());
        for (SchemaTemplate t : group) {
            t.setCurrent(t.getId().equals(target.getId()));
        }
        repository.saveAll(group);
        return toDto(target);
    }

    @Transactional
    public SchemaTemplateDto updateMetadata(Long id, UpdateTemplateMetadataRequest request, String username) {
        SchemaTemplate template = require(id);
        if (request.name() != null && !request.name().isBlank()) {
            String name = request.name().trim();
            repository.findFirstByNameIgnoreCase(name).ifPresent(other -> {
                if (!other.getGroupId().equals(template.getGroupId())) {
                    throw new ApiException(HttpStatus.CONFLICT, "A template with this name already exists");
                }
            });
            // Name is shared by the whole group; rename every version.
            List<SchemaTemplate> group = repository.findByGroupIdOrderByCreatedAtAsc(template.getGroupId());
            group.forEach(t -> t.setName(name));
            repository.saveAll(group);
        }
        if (request.version() != null && !request.version().isBlank()) {
            String version = request.version().trim();
            if (!version.equalsIgnoreCase(template.getVersion())
                    && repository.existsByGroupIdAndVersionIgnoreCase(template.getGroupId(), version)) {
                throw new ApiException(HttpStatus.CONFLICT, "Version '" + version + "' already exists for this template");
            }
            template.setVersion(version);
        }
        if (request.description() != null) template.setDescription(request.description());
        if (request.versionLabel() != null) template.setVersionLabel(request.versionLabel());
        if (request.changeNotes() != null) template.setChangeNotes(request.changeNotes());
        if (request.content() != null) template.setContent(request.content());
        template.setUpdatedAt(Instant.now());
        template.setUpdatedBy(username);
        return toDto(repository.save(template));
    }

    @Transactional
    public void delete(Long id) {
        SchemaTemplate target = require(id);
        boolean wasCurrent = target.isCurrent();
        Long groupId = target.getGroupId();
        repository.delete(target);
        if (wasCurrent) {
            // Promote the most recent remaining version to current so the group stays visible.
            repository.findByGroupIdOrderByCreatedAtAsc(groupId).stream()
                    .max(Comparator.comparing(SchemaTemplate::getCreatedAt))
                    .ifPresent(latest -> {
                        latest.setCurrent(true);
                        repository.save(latest);
                    });
        }
    }

    // ---------------- Helpers ----------------

    private SchemaTemplate require(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Template not found"));
    }

    private String defaultVersion(String version) {
        return version == null || version.isBlank() ? "1.0" : version.trim();
    }

    private SchemaTemplateSummaryDto toSummary(SchemaTemplate t) {
        long versionCount = repository.findByGroupIdOrderByCreatedAtAsc(t.getGroupId()).size();
        return new SchemaTemplateSummaryDto(t.getId(), t.getGroupId(), t.getName(), t.getDescription(),
                t.getVersion(), t.getVersionLabel(), t.isCurrent(), versionCount, t.getCreatedAt(), t.getCreatedBy());
    }

    private SchemaTemplateDto toDto(SchemaTemplate t) {
        String contentError = validate(t.getContent());
        return new SchemaTemplateDto(t.getId(), t.getGroupId(), t.getName(), t.getDescription(),
                t.getVersion(), t.getVersionLabel(), t.getContent(), t.getChangeNotes(), t.isCurrent(),
                t.getCreatedAt(), t.getCreatedBy(), t.getUpdatedAt(), t.getUpdatedBy(),
                contentError == null, contentError);
    }

    /** Returns null when the body parses against the import schema, otherwise a short error message. */
    private String validate(String content) {
        if (content == null || content.isBlank()) return "Content is empty";
        try {
            validator.readValue(content, ImportWorkflowRequest.class);
            return null;
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            return e.getOriginalMessage();
        } catch (Exception e) {
            return e.getMessage();
        }
    }
}
