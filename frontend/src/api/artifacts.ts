import { api } from './client';

export interface ArtifactSummary {
  id: number;
  name: string;
  ediRef?: string | null;
  currentStepId?: number | null;
  currentStepName?: string | null;
  templateId?: number | null;
  fileCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ArtifactNode {
  id: number;
  parentId: number | null;
  name: string;
  folder: boolean;
  sizeBytes: number;
  contentType?: string | null;
  notes?: string | null;
  createdAt: string;
  children: ArtifactNode[];
}

export interface ArtifactDetail {
  id: number;
  name: string;
  ediRef?: string | null;
  currentStepId?: number | null;
  currentStepName?: string | null;
  templateId?: number | null;
  createdAt: string;
  updatedAt: string;
  nodes: ArtifactNode[];
}

export interface StatusHistoryEntry {
  id: number;
  fromStepId?: number | null;
  fromStepName?: string | null;
  toStepId?: number | null;
  toStepName?: string | null;
  changedBy: number;
  changedByName?: string | null;
  comment?: string | null;
  changedAt: string;
}

export interface CreateArtifactPayload {
  name: string;
  ediRef?: string;
  templateId?: number | null;
}

export async function fetchArtifacts(): Promise<ArtifactSummary[]> {
  const { data } = await api.get<ArtifactSummary[]>('/artifacts');
  return data;
}

export async function fetchArtifact(id: number): Promise<ArtifactDetail> {
  const { data } = await api.get<ArtifactDetail>(`/artifacts/${id}`);
  return data;
}

export async function createArtifact(payload: CreateArtifactPayload): Promise<ArtifactDetail> {
  const { data } = await api.post<ArtifactDetail>('/artifacts', payload);
  return data;
}

export async function deleteArtifact(id: number): Promise<void> {
  await api.delete(`/artifacts/${id}`);
}

export async function createFolder(
  artifactId: number,
  payload: { parentId: number | null; name: string },
): Promise<ArtifactNode> {
  const { data } = await api.post<ArtifactNode>(`/artifacts/${artifactId}/folders`, payload);
  return data;
}

export async function uploadFiles(
  artifactId: number,
  folderId: number | null,
  files: File[],
): Promise<ArtifactDetail> {
  const form = new FormData();
  files.forEach((f) => form.append('files', f));
  const url = folderId != null ? `/artifacts/${artifactId}/files?folderId=${folderId}` : `/artifacts/${artifactId}/files`;
  const { data } = await api.post<ArtifactDetail>(url, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function deleteNode(artifactId: number, nodeId: number): Promise<void> {
  await api.delete(`/artifacts/${artifactId}/nodes/${nodeId}`);
}

export async function renameNode(
  artifactId: number,
  nodeId: number,
  name: string,
): Promise<ArtifactDetail> {
  const { data } = await api.patch<ArtifactDetail>(`/artifacts/${artifactId}/nodes/${nodeId}/rename`, { name });
  return data;
}

export async function updateNodeNotes(
  artifactId: number,
  nodeId: number,
  notes: string,
): Promise<ArtifactDetail> {
  const { data } = await api.patch<ArtifactDetail>(`/artifacts/${artifactId}/nodes/${nodeId}/notes`, { notes });
  return data;
}

export async function moveNode(
  artifactId: number,
  nodeId: number,
  parentId: number | null,
): Promise<ArtifactDetail> {
  const { data } = await api.patch<ArtifactDetail>(`/artifacts/${artifactId}/nodes/${nodeId}/move`, { parentId });
  return data;
}

export async function advanceArtifact(
  artifactId: number,
  payload: { toStepId: number; comment?: string },
): Promise<ArtifactDetail> {
  const { data } = await api.post<ArtifactDetail>(`/artifacts/${artifactId}/advance`, payload);
  return data;
}

export async function fetchHistory(artifactId: number): Promise<StatusHistoryEntry[]> {
  const { data } = await api.get<StatusHistoryEntry[]>(`/artifacts/${artifactId}/history`);
  return data;
}

// ---------------- Checklist ----------------

export interface ChecklistItem {
  id: number;
  folderNodeId: number | null;
  label: string;
  description?: string | null;
  required: boolean;
  satisfied: boolean;
  satisfiedByNodeId?: number | null;
  satisfiedByName?: string | null;
}

export interface ChecklistFolder {
  folderNodeId: number | null;
  folderName: string;
  path: string;
  mandatoryTotal: number;
  mandatorySatisfied: number;
  optionalTotal: number;
  optionalSatisfied: number;
  items: ChecklistItem[];
}

export interface ChecklistSummary {
  mandatoryTotal: number;
  mandatorySatisfied: number;
  optionalTotal: number;
  optionalSatisfied: number;
  complete: boolean;
}

export interface ChecklistView {
  summary: ChecklistSummary;
  folders: ChecklistFolder[];
}

export async function fetchChecklist(artifactId: number): Promise<ChecklistView> {
  const { data } = await api.get<ChecklistView>(`/artifacts/${artifactId}/checklist`);
  return data;
}

export async function createChecklistItem(
  artifactId: number,
  payload: { folderNodeId: number | null; label: string; description?: string | null; required: boolean },
): Promise<ChecklistView> {
  const { data } = await api.post<ChecklistView>(`/artifacts/${artifactId}/checklist`, payload);
  return data;
}

export async function updateChecklistItem(
  artifactId: number,
  itemId: number,
  payload: { label: string; description?: string | null; required: boolean },
): Promise<ChecklistView> {
  const { data } = await api.patch<ChecklistView>(`/artifacts/${artifactId}/checklist/${itemId}`, payload);
  return data;
}

export async function assignChecklistItem(
  artifactId: number,
  itemId: number,
  nodeId: number | null,
): Promise<ChecklistView> {
  const { data } = await api.put<ChecklistView>(`/artifacts/${artifactId}/checklist/${itemId}/assignment`, {
    nodeId,
  });
  return data;
}

export async function deleteChecklistItem(artifactId: number, itemId: number): Promise<ChecklistView> {
  const { data } = await api.delete<ChecklistView>(`/artifacts/${artifactId}/checklist/${itemId}`);
  return data;
}

/** Downloads a file node by streaming the blob and triggering a browser save. */
export async function downloadNode(artifactId: number, nodeId: number, fileName: string): Promise<void> {
  const res = await api.get(`/artifacts/${artifactId}/nodes/${nodeId}/download`, { responseType: 'blob' });
  triggerDownload(res.data as Blob, fileName);
}

export async function exportArtifact(artifactId: number, fileName: string): Promise<void> {
  const res = await api.get(`/artifacts/${artifactId}/export`, { responseType: 'blob' });
  triggerDownload(res.data as Blob, fileName);
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
