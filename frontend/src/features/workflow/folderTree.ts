import type { WorkflowFolder } from '../../api/workflow';

// Mirrors backend app.workflow.folder-max-depth; the backend enforces this authoritatively.
export const MAX_FOLDER_DEPTH = 3;

export interface FolderNode {
  folder: WorkflowFolder;
  children: FolderNode[];
}

const sortFolders = (a: WorkflowFolder, b: WorkflowFolder) =>
  a.orderIndex - b.orderIndex || a.name.localeCompare(b.name);

export function buildFolderTree(folders: WorkflowFolder[]): FolderNode[] {
  const byParent = new Map<number | null, WorkflowFolder[]>();
  for (const f of folders) {
    const key = f.parentId ?? null;
    const list = byParent.get(key) ?? [];
    list.push(f);
    byParent.set(key, list);
  }
  const build = (parentId: number | null): FolderNode[] =>
    (byParent.get(parentId) ?? [])
      .slice()
      .sort(sortFolders)
      .map((folder) => ({ folder, children: build(folder.id) }));
  return build(null);
}

export function flattenFolderTree(
  nodes: FolderNode[],
  depth = 0,
): { folder: WorkflowFolder; depth: number }[] {
  return nodes.flatMap((node) => [
    { folder: node.folder, depth },
    ...flattenFolderTree(node.children, depth + 1),
  ]);
}

/** Depth from the root: a top-level folder is level 1. */
export function folderLevel(id: number, byId: Map<number, WorkflowFolder>): number {
  let level = 0;
  let cursor: number | null | undefined = id;
  while (cursor != null) {
    const folder = byId.get(cursor);
    if (!folder) break;
    level++;
    cursor = folder.parentId ?? null;
  }
  return level;
}

/** Number of levels in the subtree rooted at the folder; a leaf has height 1. */
export function subtreeHeight(id: number, folders: WorkflowFolder[]): number {
  let max = 0;
  for (const f of folders) {
    if (f.parentId === id) max = Math.max(max, subtreeHeight(f.id, folders));
  }
  return 1 + max;
}

export function descendantIds(id: number, folders: WorkflowFolder[]): Set<number> {
  const out = new Set<number>();
  const walk = (parentId: number) => {
    for (const f of folders) {
      if (f.parentId === parentId && !out.has(f.id)) {
        out.add(f.id);
        walk(f.id);
      }
    }
  };
  walk(id);
  return out;
}
