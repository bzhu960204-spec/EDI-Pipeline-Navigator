import { api } from '../client';
import type {
  CreateKnowledgeNodePayload,
  KnowledgeNode,
  MoveKnowledgeNodePayload,
  UpdateKnowledgeNodePayload,
} from './types';

export async function fetchKnowledgeNode(id: number): Promise<KnowledgeNode> {
  const { data } = await api.get<KnowledgeNode>(`/knowledge/nodes/${id}`);
  return data;
}

export async function fetchNodeChildren(id: number): Promise<KnowledgeNode[]> {
  const { data } = await api.get<KnowledgeNode[]>(`/knowledge/nodes/${id}/children`);
  return data;
}

export async function fetchNodeAncestors(id: number): Promise<KnowledgeNode[]> {
  const { data } = await api.get<KnowledgeNode[]>(`/knowledge/nodes/${id}/ancestors`);
  return data;
}

export async function createKnowledgeNode(payload: CreateKnowledgeNodePayload): Promise<KnowledgeNode> {
  const { data } = await api.post<KnowledgeNode>('/knowledge/nodes', payload);
  return data;
}

export async function updateKnowledgeNode(id: number, payload: UpdateKnowledgeNodePayload): Promise<KnowledgeNode> {
  const { data } = await api.put<KnowledgeNode>(`/knowledge/nodes/${id}`, payload);
  return data;
}

export async function moveKnowledgeNode(id: number, payload: MoveKnowledgeNodePayload): Promise<KnowledgeNode> {
  const { data } = await api.put<KnowledgeNode>(`/knowledge/nodes/${id}/move`, payload);
  return data;
}

export async function deleteKnowledgeNode(id: number): Promise<void> {
  await api.delete(`/knowledge/nodes/${id}`);
}
