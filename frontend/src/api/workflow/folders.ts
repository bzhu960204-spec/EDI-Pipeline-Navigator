import { api } from '../client';
import type { WorkflowFolder, WorkflowFolderPayload } from './types';

export async function fetchFolders(): Promise<WorkflowFolder[]> {
  const { data } = await api.get<WorkflowFolder[]>('/workflow/folders');
  return data;
}

export async function createFolder(payload: WorkflowFolderPayload): Promise<WorkflowFolder> {
  const { data } = await api.post<WorkflowFolder>('/workflow/folders', payload);
  return data;
}

export async function updateFolder(id: number, payload: WorkflowFolderPayload): Promise<WorkflowFolder> {
  const { data } = await api.put<WorkflowFolder>(`/workflow/folders/${id}`, payload);
  return data;
}

export async function deleteFolder(id: number): Promise<void> {
  await api.delete(`/workflow/folders/${id}`);
}
