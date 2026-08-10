import { api } from '../client';
import type {
  ImportWorkflowPayload,
  Workflow,
  WorkflowPayload,
} from './types';

export async function fetchWorkflows(): Promise<Workflow[]> {
  const { data } = await api.get<Workflow[]>('/workflow/workflows');
  return data;
}

export async function fetchWorkflow(id: number): Promise<Workflow> {
  const { data } = await api.get<Workflow>(`/workflow/workflows/${id}`);
  return data;
}

export async function fetchVersions(id: number): Promise<Workflow[]> {
  const { data } = await api.get<Workflow[]>(`/workflow/workflows/${id}/versions`);
  return data;
}

export async function createVersion(id: number, label?: string): Promise<Workflow> {
  const { data } = await api.post<Workflow>(`/workflow/workflows/${id}/versions`, { label });
  return data;
}

export async function setCurrentVersion(id: number): Promise<Workflow> {
  const { data } = await api.post<Workflow>(`/workflow/workflows/${id}/set-current`);
  return data;
}

export async function updateVersionLabel(id: number, label?: string): Promise<Workflow> {
  const { data } = await api.put<Workflow>(`/workflow/workflows/${id}/version-label`, { label });
  return data;
}

export async function setWorkflowConfidence(id: number, confidence: number): Promise<Workflow> {
  const { data } = await api.put<Workflow>(`/workflow/workflows/${id}/confidence`, { confidence });
  return data;
}

export async function createWorkflow(payload: WorkflowPayload): Promise<Workflow> {
  const { data } = await api.post<Workflow>('/workflow/workflows', payload);
  return data;
}

export async function importWorkflow(payload: ImportWorkflowPayload): Promise<Workflow> {
  const { data } = await api.post<Workflow>('/workflow/workflows/import', payload);
  return data;
}

export async function exportWorkflow(
  id: number,
  includePhases: boolean,
  includeReviews: boolean,
): Promise<ImportWorkflowPayload> {
  const { data } = await api.get<ImportWorkflowPayload>(`/workflow/workflows/${id}/export`, {
    params: { includePhases, includeReviews },
  });
  return data;
}

export async function updateWorkflowFromImport(
  id: number,
  payload: ImportWorkflowPayload,
): Promise<Workflow> {
  const { data } = await api.put<Workflow>(`/workflow/workflows/${id}/import`, payload);
  return data;
}

export async function updateWorkflow(id: number, payload: WorkflowPayload): Promise<Workflow> {
  const { data } = await api.put<Workflow>(`/workflow/workflows/${id}`, payload);
  return data;
}

export async function deleteWorkflow(id: number): Promise<void> {
  await api.delete(`/workflow/workflows/${id}`);
}
