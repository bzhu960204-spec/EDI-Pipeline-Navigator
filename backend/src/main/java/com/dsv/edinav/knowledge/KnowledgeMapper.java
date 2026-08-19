package com.dsv.edinav.knowledge;

import com.dsv.edinav.knowledge.dto.KnowledgeNodeDto;
import com.dsv.edinav.knowledge.dto.KnowledgeTreeDto;

final class KnowledgeMapper {

    private KnowledgeMapper() {}

    static KnowledgeTreeDto toTreeDto(KnowledgeTree tree, long nodeCount) {
        return new KnowledgeTreeDto(
                tree.getId(),
                tree.getName(),
                tree.getDescription(),
                tree.getRootNodeId(),
                tree.getGroupId(),
                tree.getVersion(),
                tree.getVersionLabel(),
                tree.isCurrent(),
                tree.getOrderIndex(),
                nodeCount);
    }

    static KnowledgeNodeDto toNodeDto(KnowledgeNode node, long childCount) {
        return new KnowledgeNodeDto(
                node.getId(),
                node.getTreeId(),
                node.getParentId(),
                node.getPath(),
                node.getDepth(),
                node.getOrderIndex(),
                node.getName(),
                node.getDescription(),
                node.getNotes(),
                childCount);
    }
}
