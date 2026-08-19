package com.dsv.edinav.knowledge;

import com.dsv.edinav.common.ApiException;
import com.dsv.edinav.knowledge.dto.CreateKnowledgeVersionRequest;
import com.dsv.edinav.knowledge.dto.ImportKnowledgeNode;
import com.dsv.edinav.knowledge.dto.ImportKnowledgeTreeRequest;
import com.dsv.edinav.knowledge.dto.KnowledgeTreeDto;
import com.dsv.edinav.security.CurrentUserService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * JSON import, export and update-from-import for knowledge trees — the round-trip core.
 * Export keys each node by a stable {@code n<id>} ref so a later update-import can match it back
 * and edit it in place instead of recreating it. The tree's root is implied by the tree name and
 * never appears in the {@code nodes} list.
 */
@Service
public class KnowledgeImportExportService {

    private final KnowledgeTreeRepository treeRepository;
    private final KnowledgeNodeRepository nodeRepository;
    private final CurrentUserService currentUser;

    public KnowledgeImportExportService(KnowledgeTreeRepository treeRepository,
                                        KnowledgeNodeRepository nodeRepository,
                                        CurrentUserService currentUser) {
        this.treeRepository = treeRepository;
        this.nodeRepository = nodeRepository;
        this.currentUser = currentUser;
    }

    // ---------------- Import (new tree) ----------------

    @Transactional
    public KnowledgeTreeDto importTree(ImportKnowledgeTreeRequest request) {
        Long ownerId = currentUser.requireUserId();
        String name = requireName(request.name());

        KnowledgeTree tree = new KnowledgeTree();
        tree.setOwnerId(ownerId);
        tree.setName(name);
        tree.setDescription(request.description());
        tree.setOrderIndex((int) treeRepository.countByOwnerId(ownerId));
        tree = treeRepository.save(tree);

        KnowledgeNode root = new KnowledgeNode();
        root.setTreeId(tree.getId());
        root.setParentId(null);
        root.setDepth(0);
        root.setOrderIndex(0);
        root.setLineageKey(UUID.randomUUID().toString());
        root.setName(name);
        root.setPath("/"); // temporary; finalized once the id is assigned
        root = nodeRepository.save(root);
        root.setPath("/" + root.getId() + "/");
        root = nodeRepository.save(root);

        tree.setRootNodeId(root.getId());
        tree = treeRepository.save(tree);

        createChildren(request.nodes(), root, tree.getId());
        return KnowledgeMapper.toTreeDto(tree, nodeRepository.countByTreeId(tree.getId()));
    }

    private void createChildren(List<ImportKnowledgeNode> nodes, KnowledgeNode parent, Long treeId) {
        if (nodes == null) {
            return;
        }
        int order = 0;
        for (ImportKnowledgeNode n : nodes) {
            KnowledgeNode node = new KnowledgeNode();
            node.setTreeId(treeId);
            node.setParentId(parent.getId());
            node.setDepth(parent.getDepth() + 1);
            node.setOrderIndex(order++);
            node.setLineageKey(cleanLineageKey(n.lineageKey()));
            node.setName(requireName(n.name()));
            node.setDescription(n.description());
            node.setNotes(n.notes());
            node.setPath(parent.getPath()); // temporary; finalized once the id is assigned
            node = nodeRepository.save(node);
            node.setPath(parent.getPath() + node.getId() + "/");
            node = nodeRepository.save(node);
            createChildren(n.children(), node, treeId);
        }
    }

    // ---------------- Export ----------------

    @Transactional(readOnly = true)
    public ImportKnowledgeTreeRequest exportTree(Long id) {
        KnowledgeTree tree = requireOwnedTree(id);
        KnowledgeNode root = nodeRepository.findById(tree.getRootNodeId())
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Knowledge tree root not found"));
        Map<Long, List<KnowledgeNode>> byParent = nodeRepository.findSubtreeByPathPrefix(root.getPath()).stream()
                .filter(n -> n.getParentId() != null)
                .collect(Collectors.groupingBy(KnowledgeNode::getParentId));
        return new ImportKnowledgeTreeRequest(tree.getName(), tree.getDescription(),
                exportChildren(root.getId(), byParent));
    }

    private List<ImportKnowledgeNode> exportChildren(Long parentId, Map<Long, List<KnowledgeNode>> byParent) {
        return byParent.getOrDefault(parentId, List.of()).stream()
                .sorted(Comparator.comparingInt(KnowledgeNode::getOrderIndex).thenComparing(KnowledgeNode::getName))
                .map(n -> new ImportKnowledgeNode("n" + n.getId(), n.getLineageKey(), n.getName(), n.getDescription(),
                        n.getNotes(), exportChildren(n.getId(), byParent)))
                .toList();
    }

    // ---------------- Update from import ----------------

    /**
     * Replaces a tree's node hierarchy from an import payload. Nodes carrying an {@code n<id>} ref that
     * still exists are updated in place (id and history preserved); nodes without a matching ref are
     * created; existing nodes absent from the payload are deleted. Paths, depths and sibling order are
     * recomputed top-down.
     */
    @Transactional
    public KnowledgeTreeDto updateTreeFromImport(Long id, ImportKnowledgeTreeRequest request) {
        KnowledgeTree tree = requireOwnedTree(id);
        String name = requireName(request.name());
        KnowledgeNode root = nodeRepository.findById(tree.getRootNodeId())
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Knowledge tree root not found"));

        Map<Long, KnowledgeNode> existingById = nodeRepository.findSubtreeByPathPrefix(root.getPath()).stream()
                .collect(Collectors.toMap(KnowledgeNode::getId, n -> n, (a, b) -> a, HashMap::new));

        Set<Long> kept = new HashSet<>();
        kept.add(root.getId());
        root.setName(name);
        nodeRepository.save(root);
        mergeChildren(request.nodes(), root, tree.getId(), existingById, kept);

        for (KnowledgeNode node : new ArrayList<>(existingById.values())) {
            if (!kept.contains(node.getId())) {
                nodeRepository.delete(node);
            }
        }

        tree.setName(name);
        tree.setDescription(request.description());
        tree = treeRepository.save(tree);
        return KnowledgeMapper.toTreeDto(tree, nodeRepository.countByTreeId(tree.getId()));
    }

    private void mergeChildren(List<ImportKnowledgeNode> nodes, KnowledgeNode parent, Long treeId,
                               Map<Long, KnowledgeNode> existingById, Set<Long> kept) {
        if (nodes == null) {
            return;
        }
        int order = 0;
        for (ImportKnowledgeNode n : nodes) {
            KnowledgeNode node = matchExisting(n.ref(), existingById, kept);
            if (node == null) {
                node = new KnowledgeNode();
                node.setTreeId(treeId);
            }
            node.setParentId(parent.getId());
            node.setDepth(parent.getDepth() + 1);
            node.setOrderIndex(order++);
            node.setName(requireName(n.name()));
            node.setDescription(n.description());
            node.setNotes(n.notes());
            if (node.getLineageKey() == null || node.getLineageKey().isBlank()) {
                node.setLineageKey(cleanLineageKey(n.lineageKey()));
            }
            if (node.getId() == null) {
                node.setPath(parent.getPath()); // temporary; finalized once the id is assigned
                node = nodeRepository.save(node);
            }
            node.setPath(parent.getPath() + node.getId() + "/");
            node = nodeRepository.save(node);
            kept.add(node.getId());
            mergeChildren(n.children(), node, treeId, existingById, kept);
        }
    }

    /** Resolves an {@code n<id>} ref to a not-yet-reused existing node of this tree, or null to create anew. */
    private KnowledgeNode matchExisting(String ref, Map<Long, KnowledgeNode> existingById, Set<Long> kept) {
        if (ref == null || ref.isBlank()) {
            return null;
        }
        String digits = ref.trim();
        if (digits.startsWith("n") || digits.startsWith("N")) {
            digits = digits.substring(1);
        }
        Long refId;
        try {
            refId = Long.valueOf(digits);
        } catch (NumberFormatException e) {
            return null;
        }
        if (kept.contains(refId)) {
            return null;
        }
        return existingById.get(refId);
    }

    /** Creates a new editable version (deep copy) of a knowledge tree within the same group; not current. */
    @Transactional
    public KnowledgeTreeDto createVersion(Long sourceId, CreateKnowledgeVersionRequest request) {
        KnowledgeTree source = requireOwnedTree(sourceId);
        ImportKnowledgeTreeRequest snapshot = exportTree(sourceId);
        KnowledgeNode sourceRoot = nodeRepository.findById(source.getRootNodeId())
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Knowledge tree root not found"));

        KnowledgeTree version = new KnowledgeTree();
        version.setOwnerId(source.getOwnerId());
        version.setName(source.getName());
        version.setDescription(source.getDescription());
        version.setOrderIndex(source.getOrderIndex());
        version.setGroupId(source.getGroupId());
        version.setVersion(treeRepository.nextVersion(source.getGroupId()));
        String label = request == null || request.label() == null ? null : request.label().trim();
        version.setVersionLabel(label == null || label.isEmpty() ? null : label);
        version.setCurrent(false);
        version = treeRepository.save(version);

        KnowledgeNode root = new KnowledgeNode();
        root.setTreeId(version.getId());
        root.setParentId(null);
        root.setDepth(0);
        root.setOrderIndex(0);
        root.setLineageKey(sourceRoot.getLineageKey() != null
                ? sourceRoot.getLineageKey() : UUID.randomUUID().toString());
        root.setName(source.getName());
        root.setPath("/"); // temporary; finalized once the id is assigned
        root = nodeRepository.save(root);
        root.setPath("/" + root.getId() + "/");
        root = nodeRepository.save(root);

        version.setRootNodeId(root.getId());
        version = treeRepository.save(version);

        createChildren(snapshot.nodes(), root, version.getId());
        return KnowledgeMapper.toTreeDto(version, nodeRepository.countByTreeId(version.getId()));
    }

    private static String requireName(String raw) {
        String name = raw == null ? null : raw.trim();
        if (name == null || name.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Name is required");
        }
        return name;
    }

    /** Uses the supplied lineage key when present, otherwise mints a fresh one so every node stays trackable. */
    private static String cleanLineageKey(String raw) {
        String key = raw == null ? null : raw.trim();
        return key == null || key.isEmpty() ? UUID.randomUUID().toString() : key;
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
