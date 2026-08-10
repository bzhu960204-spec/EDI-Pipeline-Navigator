import { api } from '../client';
import type {
  CreateStepPayload,
  CreateTransitionPayload,
  Transition,
  UpdateStepPayload,
  WorkflowStep,
} from './types';

export async function fetchWorkflowTree(workflowId: number): Promise<WorkflowStep[]> {
  const { data } = await api.get<WorkflowStep[]>(`/workflow/workflows/${workflowId}/tree`);
  return data;
}

export async function fetchAllSteps(): Promise<WorkflowStep[]> {
  const { data } = await api.get<WorkflowStep[]>('/workflow/steps');
  return data;
}

export async function createStep(payload: CreateStepPayload): Promise<WorkflowStep> {
  const { data } = await api.post<WorkflowStep>('/workflow/steps', payload);
  return data;
}

export async function updateStep(id: number, payload: UpdateStepPayload): Promise<WorkflowStep> {
  const { data } = await api.put<WorkflowStep>(`/workflow/steps/${id}`, payload);
  return data;
}

export async function deleteStep(id: number): Promise<void> {
  await api.delete(`/workflow/steps/${id}`);
}

export async function createTransition(payload: CreateTransitionPayload): Promise<Transition> {
  const { data } = await api.post<Transition>('/workflow/transitions', payload);
  return data;
}

export async function deleteTransition(id: number): Promise<void> {
  await api.delete(`/workflow/transitions/${id}`);
}
