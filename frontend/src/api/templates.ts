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
  children: TemplateNode[];
}

export interface TemplateDetail {
  id: number;
  name: string;
  description?: string | null;
  isDefault: boolean;
  nodes: TemplateNode[];
}

export async function fetchTemplates(): Promise<TemplateSummary[]> {
  const { data } = await api.get<TemplateSummary[]>('/templates');
  return data;
}

export async function fetchTemplate(id: number): Promise<TemplateDetail> {
  const { data } = await api.get<TemplateDetail>(`/templates/${id}`);
  return data;
}
