package com.dsv.edinav.template;

import com.dsv.edinav.common.ApiException;
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

    public TemplateService(DirTemplateRepository templateRepository,
                           DirTemplateNodeRepository nodeRepository) {
        this.templateRepository = templateRepository;
        this.nodeRepository = nodeRepository;
    }

    @Transactional(readOnly = true)
    public List<TemplateSummaryDto> list() {
        return templateRepository.findAllByOrderByNameAsc().stream()
                .map(t -> new TemplateSummaryDto(t.getId(), t.getName(), t.getDescription(), t.isDefault()))
                .toList();
    }

    @Transactional(readOnly = true)
    public TemplateDto get(Long id) {
        DirTemplate template = templateRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Template not found"));
        return new TemplateDto(template.getId(), template.getName(), template.getDescription(),
                template.isDefault(), buildNodeTree(id));
    }

    @Transactional
    public TemplateDto create(TemplateRequest request, Long createdBy) {
        if (templateRepository.existsByNameIgnoreCase(request.name().trim())) {
            throw new ApiException(HttpStatus.CONFLICT, "Template name already exists");
        }
        DirTemplate template = new DirTemplate();
        template.setName(request.name().trim());
        template.setDescription(request.description());
        template.setCreatedBy(createdBy);
        template.setDefault(request.isDefault());
        templateRepository.save(template);
        if (request.isDefault()) {
            clearOtherDefaults(template.getId());
        }
        persistNodes(template.getId(), null, request.nodes());
        return get(template.getId());
    }

    @Transactional
    public TemplateDto update(Long id, TemplateRequest request) {
        DirTemplate template = templateRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Template not found"));
        template.setName(request.name().trim());
        template.setDescription(request.description());
        template.setDefault(request.isDefault());
        templateRepository.save(template);
        if (request.isDefault()) {
            clearOtherDefaults(id);
        }
        nodeRepository.deleteByTemplateId(id);
        persistNodes(id, null, request.nodes());
        return get(id);
    }

    @Transactional
    public void delete(Long id) {
        if (!templateRepository.existsById(id)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Template not found");
        }
        nodeRepository.deleteByTemplateId(id);
        templateRepository.deleteById(id);
    }

    @Transactional(readOnly = true)
    public List<DirTemplateNode> getNodes(Long templateId) {
        return nodeRepository.findByTemplateIdOrderByOrderIndexAsc(templateId);
    }

    public Long resolveTemplateId(Long requested) {
        if (requested != null) {
            if (!templateRepository.existsById(requested)) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "Template not found");
            }
            return requested;
        }
        return templateRepository.findFirstByIsDefaultTrue()
                .map(DirTemplate::getId)
                .orElse(null);
    }

    // ---------------- helpers ----------------

    private void clearOtherDefaults(Long keepId) {
        templateRepository.findAll().stream()
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
