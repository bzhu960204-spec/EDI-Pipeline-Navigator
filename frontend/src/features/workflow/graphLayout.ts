import type { WorkflowStep } from '../../api/workflow';

export function flatten(steps: WorkflowStep[]): WorkflowStep[] {
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

