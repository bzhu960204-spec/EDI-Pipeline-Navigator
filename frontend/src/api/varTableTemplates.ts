import { api } from './client';
import type { VarTable } from './vars';

export interface VarTableTemplateTab {
  name: string;
  keys: string[];
}

export interface VarTableTemplateSummary {
  id: number;
  name: string;
  description?: string | null;
  tabCount: number;
  keyCount: number;
  createdAt: string;
  updatedAt?: string | null;
}

export interface VarTableTemplate {
  id: number;
  name: string;
  description?: string | null;
  tabs: VarTableTemplateTab[];
  createdAt: string;
  createdBy?: string | null;
  updatedAt?: string | null;
  updatedBy?: string | null;
}

export interface VarTableTemplatePayload {
  name: string;
  description?: string | null;
  tabs: VarTableTemplateTab[];
}

export type ApplyTemplateMode = 'MERGE' | 'REPLACE';

export async function fetchVarTableTemplates(): Promise<VarTableTemplateSummary[]> {
  const { data } = await api.get<VarTableTemplateSummary[]>('/var-table-templates');
  return data;
}

export async function fetchVarTableTemplate(id: number): Promise<VarTableTemplate> {
  const { data } = await api.get<VarTableTemplate>(`/var-table-templates/${id}`);
  return data;
}

export async function createVarTableTemplate(payload: VarTableTemplatePayload): Promise<VarTableTemplate> {
  const { data } = await api.post<VarTableTemplate>('/var-table-templates', payload);
  return data;
}

export async function updateVarTableTemplate(
  id: number,
  payload: VarTableTemplatePayload,
): Promise<VarTableTemplate> {
  const { data } = await api.put<VarTableTemplate>(`/var-table-templates/${id}`, payload);
  return data;
}

export async function deleteVarTableTemplate(id: number): Promise<void> {
  await api.delete(`/var-table-templates/${id}`);
}

export async function applyVarTemplate(
  artifactId: number,
  templateId: number,
  mode: ApplyTemplateMode,
): Promise<VarTable[]> {
  const { data } = await api.post<VarTable[]>(`/artifacts/${artifactId}/var-tables/apply-template`, {
    templateId,
    mode,
  });
  return data;
}

export async function saveArtifactAsVarTemplate(
  artifactId: number,
  payload: { name: string; description?: string | null },
): Promise<VarTableTemplate> {
  const { data } = await api.post<VarTableTemplate>(
    `/artifacts/${artifactId}/var-tables/save-as-template`,
    payload,
  );
  return data;
}

export async function saveVarTableAsTemplate(
  artifactId: number,
  tableId: number,
  payload: { name: string; description?: string | null },
): Promise<VarTableTemplate> {
  const { data } = await api.post<VarTableTemplate>(
    `/artifacts/${artifactId}/var-tables/${tableId}/save-as-template`,
    payload,
  );
  return data;
}
