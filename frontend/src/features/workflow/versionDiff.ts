import type { WorkflowStep } from '../../api/workflow';

export interface FlatStep {
  path: string;
  name: string;
  description: string;
  notes: string;
  roles: string;
  phase: string;
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
  roles: 'Roles',
  phase: 'Phase',
};

export const changeColor: Record<DiffRow['change'], string> = {
  added: 'green',
  removed: 'red',
  changed: 'gold',
};

/** Flattens a step tree, keyed by lineageKey when present (rename/move proof) else by name-path. */
export function flatten(steps: WorkflowStep[], parent = ''): Map<string, FlatStep> {
  const out = new Map<string, FlatStep>();
  steps.forEach((step) => {
    const path = parent ? `${parent} / ${step.name}` : step.name;
    const key = step.lineageKey ?? `name:${path.toLowerCase()}`;
    out.set(key, {
      path,
      name: step.name,
      description: step.description ?? '',
      notes: step.notes ?? '',
      roles: step.businessRoles.map((r) => r.name).sort().join(', '),
      phase: step.phase?.name ?? '',
    });
    if (step.children?.length) {
      flatten(step.children, path).forEach((v, k) => out.set(k, v));
    }
  });
  return out;
}

function diffFields(a: FlatStep, b: FlatStep): FieldChange[] {
  const fields: FieldChange[] = [];
  if (a.name !== b.name) fields.push({ field: 'name', before: a.name, after: b.name });
  if (a.description !== b.description)
    fields.push({ field: 'description', before: a.description, after: b.description });
  if (a.notes !== b.notes) fields.push({ field: 'notes', before: a.notes, after: b.notes });
  if (a.roles !== b.roles) fields.push({ field: 'roles', before: a.roles, after: b.roles });
  if (a.phase !== b.phase) fields.push({ field: 'phase', before: a.phase, after: b.phase });
  return fields;
}

/** All fields of a single step, used to describe an added/removed step in full. */
function snapshotFields(step: FlatStep, kind: 'added' | 'removed'): FieldChange[] {
  const order: (keyof FlatStep)[] = ['name', 'description', 'notes', 'roles', 'phase'];
  return order
    .filter((f) => step[f] !== '')
    .map((f) => ({
      field: f,
      before: kind === 'removed' ? step[f] : null,
      after: kind === 'added' ? step[f] : null,
    }));
}

export function buildDiff(a: WorkflowStep[], b: WorkflowStep[]): DiffRow[] {
  const fa = flatten(a);
  const fb = flatten(b);
  const rows: DiffRow[] = [];
  fa.forEach((stepA, key) => {
    const stepB = fb.get(key);
    if (!stepB) {
      rows.push({ key, path: stepA.path, change: 'removed', fields: snapshotFields(stepA, 'removed') });
    } else {
      const fields = diffFields(stepA, stepB);
      // Show a rename as "old -> new" so the moved/renamed step reads clearly.
      const path = stepA.name !== stepB.name ? `${stepA.path} → ${stepB.path}` : stepB.path;
      if (fields.length > 0) rows.push({ key, path, change: 'changed', fields });
    }
  });
  fb.forEach((stepB, key) => {
    if (!fa.has(key)) rows.push({ key, path: stepB.path, change: 'added', fields: snapshotFields(stepB, 'added') });
  });
  return rows.sort((x, y) => x.path.localeCompare(y.path));
}
