export interface KnowledgeTree {
  id: number;
  name: string;
  description?: string | null;
  rootNodeId: number | null;
  groupId: number;
  version: number;
  versionLabel?: string | null;
  isCurrent: boolean;
  orderIndex: number;
  nodeCount: number;
}

export interface KnowledgeTreePayload {
  name: string;
  description?: string;
  orderIndex?: number;
}

export interface KnowledgeNode {
  id: number;
  treeId: number;
  parentId: number | null;
  path: string;
  depth: number;
  orderIndex: number;
  name: string;
  description?: string | null;
  notes?: string | null;
  childCount: number;
}

export interface CreateKnowledgeNodePayload {
  parentId: number;
  name: string;
  description?: string;
  notes?: string;
}

export interface UpdateKnowledgeNodePayload {
  name: string;
  description?: string;
  notes?: string;
}

export interface MoveKnowledgeNodePayload {
  newParentId: number;
  newOrderIndex?: number | null;
}

export interface ImportKnowledgeNode {
  ref?: string;
  lineageKey?: string;
  name: string;
  description?: string;
  notes?: string;
  children?: ImportKnowledgeNode[];
}

export interface ImportKnowledgeTreePayload {
  name: string;
  description?: string;
  nodes?: ImportKnowledgeNode[];
}
