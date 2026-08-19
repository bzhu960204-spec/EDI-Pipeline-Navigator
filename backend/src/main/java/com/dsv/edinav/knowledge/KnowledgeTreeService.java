package com.dsv.edinav.knowledge;

import com.dsv.edinav.common.ApiException;
import com.dsv.edinav.knowledge.dto.KnowledgeTreeDto;
import com.dsv.edinav.knowledge.dto.KnowledgeTreeRequest;
import com.dsv.edinav.security.CurrentUserService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
public class KnowledgeTreeService {

    private final KnowledgeTreeRepository treeRepository;
    private final KnowledgeNodeRepository nodeRepository;
    private final CurrentUserService currentUser;

    public KnowledgeTreeService(KnowledgeTreeRepository treeRepository,
                                KnowledgeNodeRepository nodeRepository,
                                CurrentUserService currentUser) {
        this.treeRepository = treeRepository;
        this.nodeRepository = nodeRepository;
        this.currentUser = currentUser;
    }

    @Transactional(readOnly = true)
    public List<KnowledgeTreeDto> getTrees() {
        return treeRepository.findByOwnerIdAndIsCurrentTrueOrderByOrderIndexAscNameAsc(currentUser.requireUserId()).stream()
                .map(tree -> KnowledgeMapper.toTreeDto(tree, nodeRepository.countByTreeId(tree.getId())))
                .toList();
    }

    @Transactional(readOnly = true)
    public KnowledgeTreeDto getTree(Long id) {
        KnowledgeTree tree = requireOwnedTree(id);
        return KnowledgeMapper.toTreeDto(tree, nodeRepository.countByTreeId(tree.getId()));
    }

    /** Lists every version of the logical tree the given id belongs to, oldest first. */
    @Transactional(readOnly = true)
    public List<KnowledgeTreeDto> getVersions(Long id) {
        KnowledgeTree tree = requireOwnedTree(id);
        return treeRepository.findByGroupIdOrderByVersionAsc(tree.getGroupId()).stream()
                .map(t -> KnowledgeMapper.toTreeDto(t, nodeRepository.countByTreeId(t.getId())))
                .toList();
    }

    @Transactional
    public KnowledgeTreeDto createTree(KnowledgeTreeRequest request) {
        Long ownerId = currentUser.requireUserId();
        KnowledgeTree tree = new KnowledgeTree();
        tree.setOwnerId(ownerId);
        tree.setName(request.name().trim());
        tree.setDescription(request.description());
        tree.setOrderIndex(request.orderIndex() == null
                ? (int) treeRepository.countByOwnerId(ownerId)
                : request.orderIndex());
        tree = treeRepository.save(tree);
        tree.setGroupId(tree.getId()); // a brand-new tree is version 1 of its own group
        tree = treeRepository.save(tree);

        // Every tree owns exactly one root node from which the hierarchy grows.
        KnowledgeNode root = new KnowledgeNode();
        root.setTreeId(tree.getId());
        root.setParentId(null);
        root.setDepth(0);
        root.setOrderIndex(0);
        root.setLineageKey(UUID.randomUUID().toString());
        root.setName(tree.getName());
        root.setPath("/"); // temporary; finalized once the id is assigned
        root = nodeRepository.save(root);
        root.setPath("/" + root.getId() + "/");
        nodeRepository.save(root);

        tree.setRootNodeId(root.getId());
        tree = treeRepository.save(tree);
        return KnowledgeMapper.toTreeDto(tree, 1);
    }

    /** Updates only the (optional) label of a single version. */
    @Transactional
    public KnowledgeTreeDto updateVersionLabel(Long id, String label) {
        KnowledgeTree tree = requireOwnedTree(id);
        String trimmed = label == null ? null : label.trim();
        tree.setVersionLabel(trimmed == null || trimmed.isEmpty() ? null : trimmed);
        tree = treeRepository.save(tree);
        return KnowledgeMapper.toTreeDto(tree, nodeRepository.countByTreeId(tree.getId()));
    }

    /** Makes the given version the current one for its group, unsetting the flag on its siblings. */
    @Transactional
    public KnowledgeTreeDto setCurrent(Long id) {
        KnowledgeTree target = requireOwnedTree(id);
        treeRepository.findByGroupIdOrderByVersionAsc(target.getGroupId()).forEach(t -> {
            if (t.isCurrent() && !t.getId().equals(id)) {
                t.setCurrent(false);
                treeRepository.save(t);
            }
        });
        target.setCurrent(true);
        target = treeRepository.save(target);
        return KnowledgeMapper.toTreeDto(target, nodeRepository.countByTreeId(target.getId()));
    }

    @Transactional
    public KnowledgeTreeDto updateTree(Long id, KnowledgeTreeRequest request) {
        KnowledgeTree tree = requireOwnedTree(id);
        tree.setName(request.name().trim());
        tree.setDescription(request.description());
        if (request.orderIndex() != null) {
            tree.setOrderIndex(request.orderIndex());
        }
        tree = treeRepository.save(tree);
        return KnowledgeMapper.toTreeDto(tree, nodeRepository.countByTreeId(tree.getId()));
    }

    @Transactional
    public void deleteTree(Long id) {
        KnowledgeTree tree = requireOwnedTree(id);
        Long groupId = tree.getGroupId();
        nodeRepository.deleteByTreeId(tree.getId());
        treeRepository.delete(tree);
        promoteCurrentIfNeeded(groupId);
    }

    /** After deleting a version, keep a group visible by promoting its newest remaining version to current. */
    private void promoteCurrentIfNeeded(Long groupId) {
        List<KnowledgeTree> remaining = treeRepository.findByGroupIdOrderByVersionAsc(groupId);
        if (remaining.isEmpty() || remaining.stream().anyMatch(KnowledgeTree::isCurrent)) {
            return;
        }
        KnowledgeTree newest = remaining.get(remaining.size() - 1);
        newest.setCurrent(true);
        treeRepository.save(newest);
    }

    private KnowledgeTree requireOwnedTree(Long id) {
        KnowledgeTree tree = treeRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Knowledge tree not found"));
        if (!tree.getOwnerId().equals(currentUser.requireUserId())) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Knowledge tree not found");
        }
        return tree;
    }
}
