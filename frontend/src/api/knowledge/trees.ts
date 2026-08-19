import { api } from '../client';
import type {
  ImportKnowledgeTreePayload,
  KnowledgeTree,
  KnowledgeTreePayload,
} from './types';

export async function fetchKnowledgeTrees(): Promise<KnowledgeTree[]> {
  const { data } = await api.get<KnowledgeTree[]>('/knowledge/trees');
  return data;
}

export async function fetchKnowledgeTree(id: number): Promise<KnowledgeTree> {
  const { data } = await api.get<KnowledgeTree>(`/knowledge/trees/${id}`);
  return data;
}

export async function fetchTreeVersions(id: number): Promise<KnowledgeTree[]> {
  const { data } = await api.get<KnowledgeTree[]>(`/knowledge/trees/${id}/versions`);
  return data;
}

export async function createTreeVersion(id: number, label?: string): Promise<KnowledgeTree> {
  const { data } = await api.post<KnowledgeTree>(`/knowledge/trees/${id}/versions`, { label });
  return data;
}

export async function setCurrentTreeVersion(id: number): Promise<KnowledgeTree> {
  const { data } = await api.post<KnowledgeTree>(`/knowledge/trees/${id}/set-current`);
  return data;
}

export async function updateTreeVersionLabel(id: number, label?: string): Promise<KnowledgeTree> {
  const { data } = await api.put<KnowledgeTree>(`/knowledge/trees/${id}/version-label`, { label });
  return data;
}

export async function createKnowledgeTree(payload: KnowledgeTreePayload): Promise<KnowledgeTree> {
  const { data } = await api.post<KnowledgeTree>('/knowledge/trees', payload);
  return data;
}

export async function updateKnowledgeTree(id: number, payload: KnowledgeTreePayload): Promise<KnowledgeTree> {
  const { data } = await api.put<KnowledgeTree>(`/knowledge/trees/${id}`, payload);
  return data;
}

export async function deleteKnowledgeTree(id: number): Promise<void> {
  await api.delete(`/knowledge/trees/${id}`);
}

export async function importKnowledgeTree(payload: ImportKnowledgeTreePayload): Promise<KnowledgeTree> {
  const { data } = await api.post<KnowledgeTree>('/knowledge/trees/import', payload);
  return data;
}

export async function exportKnowledgeTree(id: number): Promise<ImportKnowledgeTreePayload> {
  const { data } = await api.get<ImportKnowledgeTreePayload>(`/knowledge/trees/${id}/export`);
  return data;
}

export async function updateKnowledgeTreeFromImport(
  id: number,
  payload: ImportKnowledgeTreePayload,
): Promise<KnowledgeTree> {
  const { data } = await api.put<KnowledgeTree>(`/knowledge/trees/${id}/import`, payload);
  return data;
}
