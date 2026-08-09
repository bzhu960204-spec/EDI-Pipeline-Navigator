import type { Transition, WorkflowStep } from '../../api/workflow';

export interface FlatStep {
  id: number;
  name: string;
  depth: number;
}

/** One possible way to reach a step: a transition landing on it, plus its source step. */
export interface IncomingRef {
  transition: Transition;
  fromStep: WorkflowStep;
  isRollback: boolean;
  isSelfLoop: boolean;
}

/** Depth-first flatten of the step tree for use in selects. */
export function flattenSteps(steps: WorkflowStep[], depth = 0): FlatStep[] {
  const out: FlatStep[] = [];
  for (const step of steps) {
    out.push({ id: step.id, name: step.name, depth });
    if (step.children?.length) {
      out.push(...flattenSteps(step.children, depth + 1));
    }
  }
  return out;
}

export function findStep(steps: WorkflowStep[], id: number): WorkflowStep | null {
  for (const step of steps) {
    if (step.id === id) return step;
    const found = findStep(step.children ?? [], id);
    if (found) return found;
  }
  return null;
}

/** Flatten the tree into a plain list regardless of parent/child nesting. */
function flattenAll(steps: WorkflowStep[]): WorkflowStep[] {
  const out: WorkflowStep[] = [];
  const walk = (list: WorkflowStep[]) => {
    for (const s of list) {
      out.push(s);
      if (s.children?.length) walk(s.children);
    }
  };
  walk(steps);
  return out;
}

// Mark back (rollback) edges via DFS from the first root step, then any unvisited nodes: an
// edge to a node currently on the DFS stack is a rollback. Mirrors the graph view's detection
// so the "Previous steps" panel labels rework loops consistently.
function findRollbackEdges(all: WorkflowStep[], entryStepId: number | null | undefined): Set<string> {
  const idSet = new Set(all.map((s) => s.id));
  const adj = new Map<number, number[]>();
  all.forEach((s) => adj.set(s.id, s.transitions.filter((t) => idSet.has(t.toStepId)).map((t) => t.toStepId)));

  const back = new Set<string>();
  const state = new Map<number, 0 | 1 | 2>();
  all.forEach((s) => state.set(s.id, 0));
  const dfs = (u: number) => {
    state.set(u, 1);
    for (const v of adj.get(u) ?? []) {
      const st = state.get(v);
      if (st === 1) back.add(`${u}->${v}`);
      else if (st === 0) dfs(v);
    }
    state.set(u, 2);
  };
  if (entryStepId != null && idSet.has(entryStepId)) dfs(entryStepId);
  all.forEach((s) => {
    if (state.get(s.id) === 0) dfs(s.id);
  });
  return back;
}

/**
 * Build the reverse index: for each step id, the list of transitions that land on it
 * (its possible "previous steps"). Purely derived from the tree; no backend field needed.
 */
export function buildIncomingIndex(tree: WorkflowStep[]): Map<number, IncomingRef[]> {
  const all = flattenAll(tree);
  const byId = new Map(all.map((s) => [s.id, s]));
  const rollback = findRollbackEdges(all, tree[0]?.id ?? null);

  const index = new Map<number, IncomingRef[]>();
  for (const from of all) {
    for (const t of from.transitions) {
      const target = byId.get(t.toStepId);
      if (!target) continue;
      const list = index.get(t.toStepId) ?? [];
      list.push({
        transition: t,
        fromStep: from,
        isRollback: rollback.has(`${from.id}->${t.toStepId}`),
        isSelfLoop: from.id === t.toStepId,
      });
      index.set(t.toStepId, list);
    }
  }
  return index;
}
