import { api } from './client';

export interface SchemaTemplateSummary {
  id: number;
  groupId: number;
  name: string;
  description?: string | null;
  version: string;
  versionLabel?: string | null;
  isCurrent: boolean;
  versionCount: number;
  createdAt: string;
  createdBy?: string | null;
}

export interface SchemaTemplate {
  id: number;
  groupId: number;
  name: string;
  description?: string | null;
  version: string;
  versionLabel?: string | null;
  content: string;
  changeNotes?: string | null;
  isCurrent: boolean;
  createdAt: string;
  createdBy?: string | null;
  updatedAt?: string | null;
  updatedBy?: string | null;
  contentValid: boolean;
  contentError?: string | null;
}

export interface CreateSchemaTemplatePayload {
  name: string;
  description?: string;
  version?: string;
  versionLabel?: string;
  content: string;
  changeNotes?: string;
}

export interface CreateVersionPayload {
  version: string;
  versionLabel?: string;
  description?: string;
  content: string;
  changeNotes?: string;
}

export interface UpdateMetadataPayload {
  name?: string;
  description?: string;
  version?: string;
  versionLabel?: string;
  content?: string;
  changeNotes?: string;
}

export async function fetchSchemaTemplates(): Promise<SchemaTemplateSummary[]> {
  const { data } = await api.get<SchemaTemplateSummary[]>('/schema-templates');
  return data;
}

export async function fetchSchemaTemplate(id: number): Promise<SchemaTemplate> {
  const { data } = await api.get<SchemaTemplate>(`/schema-templates/${id}`);
  return data;
}

export async function fetchSchemaTemplateVersions(id: number): Promise<SchemaTemplate[]> {
  const { data } = await api.get<SchemaTemplate[]>(`/schema-templates/${id}/versions`);
  return data;
}

export async function createSchemaTemplate(payload: CreateSchemaTemplatePayload): Promise<SchemaTemplate> {
  const { data } = await api.post<SchemaTemplate>('/schema-templates', payload);
  return data;
}

export async function createSchemaTemplateVersion(
  id: number,
  payload: CreateVersionPayload,
): Promise<SchemaTemplate> {
  const { data } = await api.post<SchemaTemplate>(`/schema-templates/${id}/versions`, payload);
  return data;
}

export async function updateSchemaTemplateMetadata(
  id: number,
  payload: UpdateMetadataPayload,
): Promise<SchemaTemplate> {
  const { data } = await api.put<SchemaTemplate>(`/schema-templates/${id}`, payload);
  return data;
}

export async function setSchemaTemplateCurrent(id: number): Promise<SchemaTemplate> {
  const { data } = await api.put<SchemaTemplate>(`/schema-templates/${id}/current`);
  return data;
}

export async function deleteSchemaTemplate(id: number): Promise<void> {
  await api.delete(`/schema-templates/${id}`);
}
