import { api } from './client';

export interface TemplateSummary {
  id: number;
  name: string;
  description?: string | null;
  isDefault: boolean;
}

export interface TemplateNode {
  id: number;
  name: string;
  description?: string | null;
  children: TemplateNode[];
}

export interface TemplateDetail {
  id: number;
  name: string;
  description?: string | null;
  isDefault: boolean;
  nodes: TemplateNode[];
}

/** A folder definition sent when creating/updating a template; children are nested folders. */
export interface TemplateNodeInput {
  name: string;
  description?: string | null;
  children: TemplateNodeInput[];
}

export interface TemplatePayload {
  name: string;
  description?: string | null;
  isDefault: boolean;
  nodes: TemplateNodeInput[];
}

export async function fetchTemplates(): Promise<TemplateSummary[]> {
  const { data } = await api.get<TemplateSummary[]>('/templates');
  return data;
}

export async function fetchTemplate(id: number): Promise<TemplateDetail> {
  const { data } = await api.get<TemplateDetail>(`/templates/${id}`);
  return data;
}

export async function createTemplate(payload: TemplatePayload): Promise<TemplateDetail> {
  const { data } = await api.post<TemplateDetail>('/templates', payload);
  return data;
}

export async function updateTemplate(id: number, payload: TemplatePayload): Promise<TemplateDetail> {
  const { data } = await api.put<TemplateDetail>(`/templates/${id}`, payload);
  return data;
}

export async function deleteTemplate(id: number): Promise<void> {
  await api.delete(`/templates/${id}`);
}
