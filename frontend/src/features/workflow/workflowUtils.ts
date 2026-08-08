import type { WorkflowStep } from '../../api/workflow';

export interface FlatStep {
  id: number;
  name: string;
  depth: number;
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
