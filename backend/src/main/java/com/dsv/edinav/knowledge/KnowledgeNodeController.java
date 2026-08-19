package com.dsv.edinav.knowledge;

import com.dsv.edinav.knowledge.dto.CreateKnowledgeNodeRequest;
import com.dsv.edinav.knowledge.dto.KnowledgeNodeDto;
import com.dsv.edinav.knowledge.dto.MoveKnowledgeNodeRequest;
import com.dsv.edinav.knowledge.dto.UpdateKnowledgeNodeRequest;
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
public class KnowledgeNodeController {

    private final KnowledgeNodeService nodeService;

    public KnowledgeNodeController(KnowledgeNodeService nodeService) {
        this.nodeService = nodeService;
    }

    @GetMapping("/nodes/{id}")
    public KnowledgeNodeDto getNode(@PathVariable Long id) {
        return nodeService.getNode(id);
    }

    @GetMapping("/nodes/{id}/children")
    public List<KnowledgeNodeDto> getChildren(@PathVariable Long id) {
        return nodeService.getChildren(id);
    }

    @GetMapping("/nodes/{id}/ancestors")
    public List<KnowledgeNodeDto> getAncestors(@PathVariable Long id) {
        return nodeService.getAncestors(id);
    }

    @PostMapping("/nodes")
    public KnowledgeNodeDto createNode(@Valid @RequestBody CreateKnowledgeNodeRequest request) {
        return nodeService.createNode(request);
    }

    @PutMapping("/nodes/{id}")
    public KnowledgeNodeDto updateNode(@PathVariable Long id, @Valid @RequestBody UpdateKnowledgeNodeRequest request) {
        return nodeService.updateNode(id, request);
    }

    @PutMapping("/nodes/{id}/move")
    public KnowledgeNodeDto moveNode(@PathVariable Long id, @Valid @RequestBody MoveKnowledgeNodeRequest request) {
        return nodeService.moveNode(id, request);
    }

    @DeleteMapping("/nodes/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteNode(@PathVariable Long id) {
        nodeService.deleteNode(id);
    }
}
