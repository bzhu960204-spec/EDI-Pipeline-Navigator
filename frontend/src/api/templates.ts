import { api } from './client';

/** A checklist item definition on a template folder or the template root. */
export interface TemplateChecklistItem {
  id?: number;
  label: string;
  description?: string | null;
  required: boolean;
}

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
  checklist: TemplateChecklistItem[];
}

export interface TemplateDetail {
  id: number;
  name: string;
  description?: string | null;
  isDefault: boolean;
  nodes: TemplateNode[];
  checklist: TemplateChecklistItem[];
}

/** A folder definition sent when creating/updating a template; children are nested folders. */
export interface TemplateNodeInput {
  name: string;
  description?: string | null;
  children: TemplateNodeInput[];
  checklist: TemplateChecklistItem[];
}

export interface TemplatePayload {
  name: string;
  description?: string | null;
  isDefault: boolean;
  nodes: TemplateNodeInput[];
  checklist: TemplateChecklistItem[];
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

export async function importTemplate(payload: TemplatePayload): Promise<TemplateDetail> {
  const { data } = await api.post<TemplateDetail>('/templates/import', payload);
  return data;
}

export async function exportTemplate(id: number): Promise<TemplatePayload> {
  const { data } = await api.get<TemplatePayload>(`/templates/${id}/export`);
  return data;
}

export async function updateTemplateFromImport(id: number, payload: TemplatePayload): Promise<TemplateDetail> {
  const { data } = await api.put<TemplateDetail>(`/templates/${id}/import`, payload);
  return data;
}

export async function updateTemplate(id: number, payload: TemplatePayload): Promise<TemplateDetail> {
  const { data } = await api.put<TemplateDetail>(`/templates/${id}`, payload);
  return data;
}

export async function deleteTemplate(id: number): Promise<void> {
  await api.delete(`/templates/${id}`);
}
