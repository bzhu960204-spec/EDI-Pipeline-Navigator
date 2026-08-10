import { api } from '../client';
import type { WorkflowPhase, WorkflowPhasePayload } from './types';

export async function fetchPhases(workflowId: number): Promise<WorkflowPhase[]> {
  const { data } = await api.get<WorkflowPhase[]>(`/workflow/workflows/${workflowId}/phases`);
  return data;
}

export async function createPhase(workflowId: number, payload: WorkflowPhasePayload): Promise<WorkflowPhase> {
  const { data } = await api.post<WorkflowPhase>(`/workflow/workflows/${workflowId}/phases`, payload);
  return data;
}

export async function updatePhase(id: number, payload: WorkflowPhasePayload): Promise<WorkflowPhase> {
  const { data } = await api.put<WorkflowPhase>(`/workflow/phases/${id}`, payload);
  return data;
}

export async function deletePhase(id: number): Promise<void> {
  await api.delete(`/workflow/phases/${id}`);
}
