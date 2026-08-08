import { api } from './client';

export type WorkflowType = 'SUB' | 'MASTER';
export type WorkflowStatus = 'DRAFT' | 'PUBLISHED';

export interface Workflow {
  id: number;
  name: string;
  description?: string | null;
  type: WorkflowType;
  status: WorkflowStatus;
  entryStepId?: number | null;
  version: number;
  orderIndex: number;
  stepCount: number;
}

export interface WorkflowPayload {
  name: string;
  description?: string;
  type?: WorkflowType;
  status?: WorkflowStatus;
  entryStepId?: number | null;
}

export interface BusinessRole {
  id: number;
  name: string;
  color?: string | null;
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
  businessRole?: BusinessRole | null;
  children: WorkflowStep[];
  transitions: Transition[];
}

export interface CreateStepPayload {
  workflowId?: number | null;
  parentId?: number | null;
  name: string;
  description?: string;
  notes?: string;
  businessRoleId?: number | null;
}

export type UpdateStepPayload = Omit<CreateStepPayload, 'parentId' | 'workflowId'>;

export interface BusinessRolePayload {
  name: string;
  color?: string;
  description?: string;
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

export async function fetchWorkflows(params?: { type?: WorkflowType; status?: WorkflowStatus }): Promise<Workflow[]> {
  const { data } = await api.get<Workflow[]>('/workflow/workflows', { params });
  return data;
}

export async function fetchWorkflow(id: number): Promise<Workflow> {
  const { data } = await api.get<Workflow>(`/workflow/workflows/${id}`);
  return data;
}

export async function createWorkflow(payload: WorkflowPayload): Promise<Workflow> {
  const { data } = await api.post<Workflow>('/workflow/workflows', payload);
  return data;
}

export interface ImportStepNode {
  ref: string;
  name: string;
  description?: string;
  notes?: string;
  role?: string;
  children?: ImportStepNode[];
}

export interface ImportTransition {
  from: string;
  to: string;
  label?: string;
}

export interface ImportWorkflowPayload {
  name: string;
  description?: string;
  type?: WorkflowType;
  status?: WorkflowStatus;
  entryStepRef?: string;
  steps?: ImportStepNode[];
  transitions?: ImportTransition[];
}

export async function importWorkflow(payload: ImportWorkflowPayload): Promise<Workflow> {
  const { data } = await api.post<Workflow>('/workflow/workflows/import', payload);
  return data;
}

export async function updateWorkflow(id: number, payload: WorkflowPayload): Promise<Workflow> {
  const { data } = await api.put<Workflow>(`/workflow/workflows/${id}`, payload);
  return data;
}

export async function deleteWorkflow(id: number): Promise<void> {
  await api.delete(`/workflow/workflows/${id}`);
}

export interface WorkflowLink {
  id: number;
  masterWorkflowId: number;
  fromWorkflowId: number;
  fromExitStepId: number | null;
  fromExitStepName: string | null;
  toWorkflowId: number;
  toEntryStepId: number | null;
  toEntryStepName: string | null;
  label?: string | null;
  orderIndex: number;
}

export interface CompositeMember {
  workflow: Workflow;
  tree: WorkflowStep[];
}

export interface WorkflowComposite {
  master: Workflow;
  members: CompositeMember[];
  links: WorkflowLink[];
}

export interface WorkflowLinkPayload {
  masterWorkflowId: number;
  fromWorkflowId: number;
  fromExitStepId?: number | null;
  toWorkflowId: number;
  toEntryStepId?: number | null;
  label?: string;
}

export async function fetchComposite(masterId: number): Promise<WorkflowComposite> {
  const { data } = await api.get<WorkflowComposite>(`/workflow/workflows/${masterId}/composite`);
  return data;
}

export async function addMember(masterId: number, subWorkflowId: number): Promise<WorkflowComposite> {
  const { data } = await api.post<WorkflowComposite>(`/workflow/workflows/${masterId}/members`, { subWorkflowId });
  return data;
}

export async function removeMember(masterId: number, subId: number): Promise<WorkflowComposite> {
  const { data } = await api.delete<WorkflowComposite>(`/workflow/workflows/${masterId}/members/${subId}`);
  return data;
}

export async function createLink(payload: WorkflowLinkPayload): Promise<WorkflowLink> {
  const { data } = await api.post<WorkflowLink>('/workflow/links', payload);
  return data;
}

export async function deleteLink(id: number): Promise<void> {
  await api.delete(`/workflow/links/${id}`);
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
