package com.dsv.edinav.knowledge;

import com.dsv.edinav.common.ApiException;
import com.dsv.edinav.knowledge.dto.CreateKnowledgeNodeRequest;
import com.dsv.edinav.knowledge.dto.KnowledgeNodeDto;
import com.dsv.edinav.knowledge.dto.MoveKnowledgeNodeRequest;
import com.dsv.edinav.knowledge.dto.UpdateKnowledgeNodeRequest;
import com.dsv.edinav.security.CurrentUserService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

@Service
public class KnowledgeNodeService {

    private final KnowledgeNodeRepository nodeRepository;
    private final KnowledgeTreeRepository treeRepository;
    private final CurrentUserService currentUser;

    public KnowledgeNodeService(KnowledgeNodeRepository nodeRepository,
                                KnowledgeTreeRepository treeRepository,
                                CurrentUserService currentUser) {
        this.nodeRepository = nodeRepository;
        this.treeRepository = treeRepository;
        this.currentUser = currentUser;
    }

    @Transactional(readOnly = true)
    public KnowledgeNodeDto getNode(Long id) {
        return toDto(requireOwnedNode(id));
    }

    @Transactional(readOnly = true)
    public List<KnowledgeNodeDto> getChildren(Long id) {
        requireOwnedNode(id);
        return nodeRepository.findByParentIdOrderByOrderIndexAscNameAsc(id).stream()
                .map(this::toDto).toList();
    }

    /** Ancestor chain including the node itself, ordered from root to the node, for breadcrumbs. */
    @Transactional(readOnly = true)
    public List<KnowledgeNodeDto> getAncestors(Long id) {
        KnowledgeNode node = requireOwnedNode(id);
        List<Long> ids = parsePathIds(node.getPath());
        return nodeRepository.findByIdInOrderByDepthAsc(ids).stream()
                .map(this::toDto).toList();
    }

    @Transactional
    public KnowledgeNodeDto createNode(CreateKnowledgeNodeRequest request) {
        KnowledgeNode parent = requireOwnedNode(request.parentId());
        KnowledgeNode node = new KnowledgeNode();
        node.setTreeId(parent.getTreeId());
        node.setParentId(parent.getId());
        node.setDepth(parent.getDepth() + 1);
        node.setOrderIndex((int) nodeRepository.countByParentId(parent.getId()));
        node.setLineageKey(UUID.randomUUID().toString());
        node.setName(request.name().trim());
        node.setDescription(request.description());
        node.setNotes(request.notes());
        node.setPath(parent.getPath()); // temporary; finalized once the id is assigned
        node = nodeRepository.save(node);
        node.setPath(parent.getPath() + node.getId() + "/");
        node = nodeRepository.save(node);
        return toDto(node);
    }

    @Transactional
    public KnowledgeNodeDto updateNode(Long id, UpdateKnowledgeNodeRequest request) {
        KnowledgeNode node = requireOwnedNode(id);
        node.setName(request.name().trim());
        node.setDescription(request.description());
        node.setNotes(request.notes());
        return toDto(nodeRepository.save(node));
    }

    @Transactional
    public void deleteNode(Long id) {
        KnowledgeNode node = requireOwnedNode(id);
        if (node.getParentId() == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "The root node cannot be deleted; delete the tree instead");
        }
        nodeRepository.deleteSubtreeByPathPrefix(node.getPath());
    }

    /**
     * Re-parents a node (and its whole subtree) under {@code newParentId}, optionally at a given
     * sibling position. Recomputes {@code path} and {@code depth} for every descendant and reindexes
     * the target parent's children. Moving under the same parent acts as a pure reorder.
     */
    @Transactional
    public KnowledgeNodeDto moveNode(Long id, MoveKnowledgeNodeRequest request) {
        KnowledgeNode node = requireOwnedNode(id);
        if (node.getParentId() == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "The root node cannot be moved");
        }
        KnowledgeNode newParent = requireOwnedNode(request.newParentId());
        if (!newParent.getTreeId().equals(node.getTreeId())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Cannot move a node across trees");
        }
        // Reject moving a node into itself or any of its own descendants (would create a cycle).
        if (newParent.getPath().startsWith(node.getPath())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Cannot move a node into itself or its own sub-node");
        }

        String oldPath = node.getPath();
        String newPath = newParent.getPath() + node.getId() + "/";
        if (!newPath.equals(oldPath)) {
            int depthDelta = (newParent.getDepth() + 1) - node.getDepth();
            // The node itself is included here (its own path has the oldPath prefix), so it gets updated too.
            List<KnowledgeNode> subtree = nodeRepository.findSubtreeByPathPrefix(oldPath);
            for (KnowledgeNode n : subtree) {
                n.setPath(newPath + n.getPath().substring(oldPath.length()));
                n.setDepth(n.getDepth() + depthDelta);
            }
            node.setParentId(newParent.getId());
            nodeRepository.saveAll(subtree);
        }

        reindexSiblings(newParent.getId(), node, request.newOrderIndex());
        return toDto(node);
    }

    /** Places {@code moved} at {@code desiredIndex} among the parent's children and renumbers order. */
    private void reindexSiblings(Long parentId, KnowledgeNode moved, Integer desiredIndex) {
        List<KnowledgeNode> ordered = new ArrayList<>(
                nodeRepository.findByParentIdOrderByOrderIndexAscNameAsc(parentId));
        ordered.removeIf(n -> n.getId().equals(moved.getId()));
        int idx = desiredIndex == null ? ordered.size() : Math.min(Math.max(desiredIndex, 0), ordered.size());
        ordered.add(idx, moved);
        for (int i = 0; i < ordered.size(); i++) {
            ordered.get(i).setOrderIndex(i);
        }
        nodeRepository.saveAll(ordered);
    }

    private KnowledgeNodeDto toDto(KnowledgeNode node) {
        return KnowledgeMapper.toNodeDto(node, nodeRepository.countByParentId(node.getId()));
    }

    private KnowledgeNode requireOwnedNode(Long id) {
        KnowledgeNode node = nodeRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Knowledge node not found"));
        KnowledgeTree tree = treeRepository.findById(node.getTreeId())
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Knowledge node not found"));
        if (!tree.getOwnerId().equals(currentUser.requireUserId())) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Knowledge node not found");
        }
        return node;
    }

    private static List<Long> parsePathIds(String path) {
        return Arrays.stream(path.split("/"))
                .filter(s -> !s.isBlank())
                .map(Long::valueOf)
                .toList();
    }
}
