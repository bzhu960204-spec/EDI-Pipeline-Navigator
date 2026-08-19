import type { ImportKnowledgeNode, ImportKnowledgeTreePayload } from '../../api/knowledge';

export interface FlatNode {
  path: string;
  name: string;
  description: string;
  notes: string;
}

export type FieldChange = {
  field: string;
  before: string | null;
  after: string | null;
};

export type DiffRow = {
  key: string;
  path: string;
  change: 'added' | 'removed' | 'changed';
  fields: FieldChange[];
};

export const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  description: 'Description',
  notes: 'Notes',
};

export const changeColor: Record<DiffRow['change'], string> = {
  added: 'green',
  removed: 'red',
  changed: 'gold',
};

/** Flattens a node tree, keyed by lineageKey when present (rename/move proof) else by name-path. */
export function flatten(nodes: ImportKnowledgeNode[] | undefined, parent = ''): Map<string, FlatNode> {
  const out = new Map<string, FlatNode>();
  (nodes ?? []).forEach((node) => {
    const path = parent ? `${parent} / ${node.name}` : node.name;
    const key = node.lineageKey ?? `name:${path.toLowerCase()}`;
    out.set(key, {
      path,
      name: node.name,
      description: node.description ?? '',
      notes: node.notes ?? '',
    });
    if (node.children?.length) {
      flatten(node.children, path).forEach((v, k) => out.set(k, v));
    }
  });
  return out;
}

function diffFields(a: FlatNode, b: FlatNode): FieldChange[] {
  const fields: FieldChange[] = [];
  if (a.name !== b.name) fields.push({ field: 'name', before: a.name, after: b.name });
  if (a.description !== b.description)
    fields.push({ field: 'description', before: a.description, after: b.description });
  if (a.notes !== b.notes) fields.push({ field: 'notes', before: a.notes, after: b.notes });
  return fields;
}

/** All non-empty fields of a single node, used to describe an added/removed node in full. */
function snapshotFields(node: FlatNode, kind: 'added' | 'removed'): FieldChange[] {
  const order: (keyof FlatNode)[] = ['name', 'description', 'notes'];
  return order
    .filter((f) => node[f] !== '')
    .map((f) => ({
      field: f,
      before: kind === 'removed' ? node[f] : null,
      after: kind === 'added' ? node[f] : null,
    }));
}

/** Builds an ordered diff between two exported tree snapshots (before -> after). */
export function buildDiff(
  before: ImportKnowledgeTreePayload,
  after: ImportKnowledgeTreePayload,
): DiffRow[] {
  const a = flatten(before.nodes);
  const b = flatten(after.nodes);
  const rows: DiffRow[] = [];

  a.forEach((node, key) => {
    if (!b.has(key)) {
      rows.push({ key, path: node.path, change: 'removed', fields: snapshotFields(node, 'removed') });
    }
  });

  b.forEach((node, key) => {
    const prev = a.get(key);
    if (!prev) {
      rows.push({ key, path: node.path, change: 'added', fields: snapshotFields(node, 'added') });
      return;
    }
    const fields = diffFields(prev, node);
    if (fields.length) {
      rows.push({ key, path: node.path, change: 'changed', fields });
    }
  });

  return rows.sort((x, y) => x.path.localeCompare(y.path));
}
