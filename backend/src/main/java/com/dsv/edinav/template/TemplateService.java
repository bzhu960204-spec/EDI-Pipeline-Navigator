package com.dsv.edinav.template;

import com.dsv.edinav.common.ApiException;
import com.dsv.edinav.security.CurrentUserService;
import com.dsv.edinav.template.dto.TemplateDto;
import com.dsv.edinav.template.dto.TemplateNodeDto;
import com.dsv.edinav.template.dto.TemplateNodeInput;
import com.dsv.edinav.template.dto.TemplateRequest;
import com.dsv.edinav.template.dto.TemplateSummaryDto;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class TemplateService {

    private final DirTemplateRepository templateRepository;
    private final DirTemplateNodeRepository nodeRepository;
    private final CurrentUserService currentUser;

    public TemplateService(DirTemplateRepository templateRepository,
                           DirTemplateNodeRepository nodeRepository,
                           CurrentUserService currentUser) {
        this.templateRepository = templateRepository;
        this.nodeRepository = nodeRepository;
        this.currentUser = currentUser;
    }

    @Transactional(readOnly = true)
    public List<TemplateSummaryDto> list() {
        return templateRepository.findByCreatedByOrderByNameAsc(currentUser.requireUserId()).stream()
                .map(t -> new TemplateSummaryDto(t.getId(), t.getName(), t.getDescription(), t.isDefault()))
                .toList();
    }

    @Transactional(readOnly = true)
    public TemplateDto get(Long id) {
        DirTemplate template = requireOwned(id);
        return new TemplateDto(template.getId(), template.getName(), template.getDescription(),
                template.isDefault(), buildNodeTree(id));
    }

    @Transactional
    public TemplateDto create(TemplateRequest request, Long createdBy) {
        if (templateRepository.existsByNameIgnoreCaseAndCreatedBy(request.name().trim(), createdBy)) {
            throw new ApiException(HttpStatus.CONFLICT, "Template name already exists");
        }
        DirTemplate template = new DirTemplate();
        template.setName(request.name().trim());
        template.setDescription(request.description());
        template.setCreatedBy(createdBy);
        template.setDefault(request.isDefault());
        templateRepository.save(template);
        if (request.isDefault()) {
            clearOtherDefaults(template.getId(), createdBy);
        }
        persistNodes(template.getId(), null, request.nodes());
        return get(template.getId());
    }

    @Transactional
    public TemplateDto update(Long id, TemplateRequest request) {
        DirTemplate template = requireOwned(id);
        template.setName(request.name().trim());
        template.setDescription(request.description());
        template.setDefault(request.isDefault());
        templateRepository.save(template);
        if (request.isDefault()) {
            clearOtherDefaults(id, template.getCreatedBy());
        }
        nodeRepository.deleteByTemplateId(id);
        persistNodes(id, null, request.nodes());
        return get(id);
    }

    @Transactional
    public void delete(Long id) {
        requireOwned(id);
        nodeRepository.deleteByTemplateId(id);
        templateRepository.deleteById(id);
    }

    /** Creates a template from an imported JSON document; never steals the default flag. */
    @Transactional
    public TemplateDto importNew(TemplateRequest request, Long createdBy) {
        TemplateRequest sanitized = new TemplateRequest(request.name(), request.description(), false, request.nodes());
        return create(sanitized, createdBy);
    }

    /** Replaces an existing template's metadata and folder tree from an imported JSON document. */
    @Transactional
    public TemplateDto importUpdate(Long id, TemplateRequest request) {
        return update(id, request);
    }

    /** Serialises a template into the same shape accepted by import, without database ids. */
    @Transactional(readOnly = true)
    public TemplateRequest export(Long id) {
        DirTemplate template = requireOwned(id);
        return new TemplateRequest(template.getName(), template.getDescription(),
                template.isDefault(), toInputTree(buildNodeTree(id)));
    }

    private List<TemplateNodeInput> toInputTree(List<TemplateNodeDto> nodes) {
        return nodes.stream()
                .map(n -> new TemplateNodeInput(n.name(), n.description(), toInputTree(n.children())))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<DirTemplateNode> getNodes(Long templateId) {
        return nodeRepository.findByTemplateIdOrderByOrderIndexAsc(templateId);
    }

    public Long resolveTemplateId(Long requested) {
        Long ownerId = currentUser.requireUserId();
        if (requested != null) {
            requireOwned(requested);
            return requested;
        }
        return templateRepository.findFirstByCreatedByAndIsDefaultTrue(ownerId)
                .map(DirTemplate::getId)
                .orElse(null);
    }

    // ---------------- helpers ----------------

    private DirTemplate requireOwned(Long id) {
        DirTemplate template = templateRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Template not found"));
        if (!currentUser.requireUserId().equals(template.getCreatedBy())) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Template not found");
        }
        return template;
    }

    private void clearOtherDefaults(Long keepId, Long ownerId) {
        templateRepository.findByCreatedByOrderByNameAsc(ownerId).stream()
                .filter(t -> t.isDefault() && !t.getId().equals(keepId))
                .forEach(t -> {
                    t.setDefault(false);
                    templateRepository.save(t);
                });
    }

    private void persistNodes(Long templateId, Long parentId, List<TemplateNodeInput> inputs) {
        if (inputs == null) {
            return;
        }
        int order = 0;
        for (TemplateNodeInput input : inputs) {
            DirTemplateNode node = new DirTemplateNode();
            node.setTemplateId(templateId);
            node.setParentId(parentId);
            node.setName(input.name().trim());
            node.setDescription(input.description());
            node.setOrderIndex(order++);
            nodeRepository.save(node);
            persistNodes(templateId, node.getId(), input.children());
        }
    }

    private List<TemplateNodeDto> buildNodeTree(Long templateId) {
        List<DirTemplateNode> nodes = nodeRepository.findByTemplateIdOrderByOrderIndexAsc(templateId);
        Map<Long, List<DirTemplateNode>> byParent = nodes.stream()
                .collect(Collectors.groupingBy(n -> n.getParentId() == null ? 0L : n.getParentId()));
        return buildChildren(0L, byParent);
    }

    private List<TemplateNodeDto> buildChildren(Long parentKey, Map<Long, List<DirTemplateNode>> byParent) {
        List<TemplateNodeDto> out = new ArrayList<>();
        byParent.getOrDefault(parentKey, List.of()).stream()
                .sorted(Comparator.comparingInt(DirTemplateNode::getOrderIndex))
                .forEach(n -> out.add(new TemplateNodeDto(n.getId(), n.getName(), n.getDescription(), buildChildren(n.getId(), byParent))));
        return out;
    }
}
