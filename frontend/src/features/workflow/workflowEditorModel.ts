import type {
  ImportPhaseNode,
  ImportReviewNode,
  ImportStepNode,
  ImportTransition,
  ImportWorkflowPayload,
} from '../../api/workflow';

/** In-memory editing draft; mirrors the import/export JSON so it round-trips through update-import. */
export interface EditorDraft {
  meta: Omit<ImportWorkflowPayload, 'steps' | 'transitions' | 'phases'>;
  phases: ImportPhaseNode[];
  steps: ImportStepNode[];
  transitions: ImportTransition[];
}

let tempSeq = 0;
/** Ref for a step created in the editor; unknown refs are treated as new rows on save. */
export function makeTempRef(): string {
  tempSeq += 1;
  return `new-${Date.now().toString(36)}-${tempSeq}`;
}

export function isNewRef(ref: string): boolean {
  return ref.startsWith('new-');
}

export function phaseRefToId(ref?: string | null): number | null {
  if (!ref) return null;
  const m = /^p(\d+)$/.exec(ref.trim());
  return m ? Number(m[1]) : null;
}

export function phaseIdToRef(id: number): string {
  return `p${id}`;
}

function cloneSteps(steps: ImportStepNode[]): ImportStepNode[] {
  return steps.map((s) => ({
    ...s,
    roles: s.roles ? [...s.roles] : undefined,
    children: s.children ? cloneSteps(s.children) : undefined,
  }));
}

export function buildDraft(payload: ImportWorkflowPayload): EditorDraft {
  const { steps, transitions, phases, ...meta } = payload;
  return {
    meta,
    phases: phases ? phases.map((p) => ({ ...p })) : [],
    steps: steps ? cloneSteps(steps) : [],
    transitions: transitions ? transitions.map((t) => ({ ...t })) : [],
  };
}

export function serializeDraft(draft: EditorDraft): ImportWorkflowPayload {
  const validRefs = collectRefs(draft.steps);
  return {
    ...draft.meta,
    phases: draft.phases.length ? draft.phases : undefined,
    steps: draft.steps,
    transitions: draft.transitions.filter((t) => validRefs.has(t.from) && validRefs.has(t.to)),
  };
}

export function collectRefs(steps: ImportStepNode[], acc: Set<string> = new Set()): Set<string> {
  for (const s of steps) {
    acc.add(s.ref);
    if (s.children?.length) collectRefs(s.children, acc);
  }
  return acc;
}

/** Maps each step ref to its reviews, used to carry reviews into a save-as-new-version payload. */
export function collectReviewsByRef(
  steps: ImportStepNode[] | undefined,
  acc: Map<string, ImportReviewNode[]> = new Map(),
): Map<string, ImportReviewNode[]> {
  for (const s of steps ?? []) {
    if (s.reviews?.length) acc.set(s.ref, s.reviews);
    if (s.children?.length) collectReviewsByRef(s.children, acc);
  }
  return acc;
}

/** Attaches reviews (by ref) onto the given step tree in place. */
export function attachReviews(
  steps: ImportStepNode[],
  reviewsByRef: Map<string, ImportReviewNode[]>,
): void {
  for (const s of steps) {
    const reviews = reviewsByRef.get(s.ref);
    if (reviews) s.reviews = reviews;
    if (s.children?.length) attachReviews(s.children, reviewsByRef);
  }
}

export function findStep(steps: ImportStepNode[], ref: string): ImportStepNode | null {
  for (const s of steps) {
    if (s.ref === ref) return s;
    if (s.children?.length) {
      const hit = findStep(s.children, ref);
      if (hit) return hit;
    }
  }
  return null;
}

/** Removes the step with the given ref from the tree (mutating) and returns it, or null. */
export function removeStep(steps: ImportStepNode[], ref: string): ImportStepNode | null {
  const idx = steps.findIndex((s) => s.ref === ref);
  if (idx >= 0) {
    const [removed] = steps.splice(idx, 1);
    return removed;
  }
  for (const s of steps) {
    if (s.children?.length) {
      const removed = removeStep(s.children, ref);
      if (removed) return removed;
    }
  }
  return null;
}

/** True when maybeDescRef sits anywhere inside the subtree rooted at ancestorRef. */
export function isDescendant(
  steps: ImportStepNode[],
  ancestorRef: string,
  maybeDescRef: string,
): boolean {
  const ancestor = findStep(steps, ancestorRef);
  if (!ancestor?.children?.length) return false;
  return findStep(ancestor.children, maybeDescRef) != null;
}
