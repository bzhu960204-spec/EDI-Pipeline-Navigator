import { api } from './client';

export type WorkflowStatus = 'DRAFT' | 'PUBLISHED';

export interface WorkflowTag {
  id: number;
  name: string;
  color?: string | null;
}

export interface Workflow {
  id: number;
  name: string;
  description?: string | null;
  status: WorkflowStatus;
  groupId: number;
  version: number;
  versionLabel?: string | null;
  isCurrent: boolean;
  orderIndex: number;
  stepCount: number;
  tags: WorkflowTag[];
}

export interface WorkflowPayload {
  name: string;
  description?: string;
  status?: WorkflowStatus;
  tagIds?: number[];
}

export interface BusinessRole {
  id: number;
  name: string;
  color?: string | null;
  description?: string | null;
}

export interface WorkflowPhase {
  id: number;
  workflowId: number;
  name: string;
  color?: string | null;
  orderIndex: number;
  description?: string | null;
}

export interface Transition {
  id: number;
  fromStepId: number;
  toStepId: number;
  toStepName: string;
  label?: string | null;
  orderIndex: number;
}

export interface WorkflowStep {
  id: number;
  workflowId: number;
  parentId: number | null;
  orderIndex: number;
  name: string;
  description?: string | null;
  notes?: string | null;
  lineageKey?: string | null;
  businessRoles: BusinessRole[];
  phase?: WorkflowPhase | null;
  children: WorkflowStep[];
  transitions: Transition[];
}

export interface CreateStepPayload {
  workflowId?: number | null;
  parentId?: number | null;
  name: string;
  description?: string;
  notes?: string;
  businessRoleIds?: number[];
  phaseId?: number | null;
}

export type UpdateStepPayload = Omit<CreateStepPayload, 'parentId' | 'workflowId'>;

export interface BusinessRolePayload {
  name: string;
  color?: string;
  description?: string;
}

export interface WorkflowPhasePayload {
  name: string;
  color?: string;
  orderIndex?: number;
  description?: string;
}

export interface WorkflowTagPayload {
  name: string;
  color?: string;
}

export interface CreateTransitionPayload {
  fromStepId: number;
  toStepId: number;
  label?: string;
}

export async function fetchWorkflowTree(workflowId: number): Promise<WorkflowStep[]> {
  const { data } = await api.get<WorkflowStep[]>(`/workflow/workflows/${workflowId}/tree`);
  return data;
}

export async function fetchAllSteps(): Promise<WorkflowStep[]> {
  const { data } = await api.get<WorkflowStep[]>('/workflow/steps');
  return data;
}

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

export async function createWorkflow(payload: WorkflowPayload): Promise<Workflow> {
  const { data } = await api.post<Workflow>('/workflow/workflows', payload);
  return data;
}

export interface ImportStepNode {
  ref: string;
  lineageKey?: string;
  name: string;
  description?: string;
  notes?: string;
  role?: string;
  roles?: string[];
  phase?: string;
  children?: ImportStepNode[];
}

export interface ImportPhaseNode {
  ref?: string;
  name: string;
  color?: string;
  orderIndex?: number;
  description?: string;
}

export interface ImportTransition {
  from: string;
  to: string;
  label?: string;
}

export interface ImportWorkflowPayload {
  name: string;
  description?: string;
  status?: WorkflowStatus;
  tags?: string[];
  phases?: ImportPhaseNode[];
  steps?: ImportStepNode[];
  transitions?: ImportTransition[];
}

export async function importWorkflow(payload: ImportWorkflowPayload): Promise<Workflow> {
  const { data } = await api.post<Workflow>('/workflow/workflows/import', payload);
  return data;
}

export async function exportWorkflow(id: number, includePhases: boolean): Promise<ImportWorkflowPayload> {
  const { data } = await api.get<ImportWorkflowPayload>(`/workflow/workflows/${id}/export`, {
    params: { includePhases },
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

export async function createStep(payload: CreateStepPayload): Promise<WorkflowStep> {
  const { data } = await api.post<WorkflowStep>('/workflow/steps', payload);
  return data;
}

export async function updateStep(id: number, payload: UpdateStepPayload): Promise<WorkflowStep> {
  const { data } = await api.put<WorkflowStep>(`/workflow/steps/${id}`, payload);
  return data;
}

export async function deleteStep(id: number): Promise<void> {
  await api.delete(`/workflow/steps/${id}`);
}

export async function createTransition(payload: CreateTransitionPayload): Promise<Transition> {
  const { data } = await api.post<Transition>('/workflow/transitions', payload);
  return data;
}

export async function deleteTransition(id: number): Promise<void> {
  await api.delete(`/workflow/transitions/${id}`);
}

export async function fetchRoles(): Promise<BusinessRole[]> {
  const { data } = await api.get<BusinessRole[]>('/workflow/roles');
  return data;
}

export async function fetchStepsByRole(roleId: number): Promise<WorkflowStep[]> {
  const { data } = await api.get<WorkflowStep[]>(`/workflow/roles/${roleId}/steps`);
  return data;
}

export async function createRole(payload: BusinessRolePayload): Promise<BusinessRole> {
  const { data } = await api.post<BusinessRole>('/workflow/roles', payload);
  return data;
}

export async function updateRole(id: number, payload: BusinessRolePayload): Promise<BusinessRole> {
  const { data } = await api.put<BusinessRole>(`/workflow/roles/${id}`, payload);
  return data;
}

export async function deleteRole(id: number): Promise<void> {
  await api.delete(`/workflow/roles/${id}`);
}

export async function fetchPhases(workflowId: number): Promise<WorkflowPhase[]> {
  const { data } = await api.get<WorkflowPhase[]>(`/workflow/workflows/${workflowId}/phases`);
  return data;
}

export async function createPhase(workflowId: number, payload: WorkflowPhasePayload): Promise<WorkflowPhase> {
  const { data } = await api.post<WorkflowPhase>(`/workflow/workflows/${workflowId}/phases`, payload);
  return data;
}

export async function updatePhase(id: number, payload: WorkflowPhasePayload): Promise<WorkflowPhase> {
  const { data } = await api.put<WorkflowPhase>(`/workflow/phases/${id}`, payload);
  return data;
}

export async function deletePhase(id: number): Promise<void> {
  await api.delete(`/workflow/phases/${id}`);
}

export async function fetchTags(): Promise<WorkflowTag[]> {
  const { data } = await api.get<WorkflowTag[]>('/workflow/tags');
  return data;
}

export async function createTag(payload: WorkflowTagPayload): Promise<WorkflowTag> {
  const { data } = await api.post<WorkflowTag>('/workflow/tags', payload);
  return data;
}

export async function updateTag(id: number, payload: WorkflowTagPayload): Promise<WorkflowTag> {
  const { data } = await api.put<WorkflowTag>(`/workflow/tags/${id}`, payload);
  return data;
}

export async function deleteTag(id: number): Promise<void> {
  await api.delete(`/workflow/tags/${id}`);
}
