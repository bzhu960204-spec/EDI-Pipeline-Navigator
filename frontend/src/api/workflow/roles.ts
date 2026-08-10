import { api } from '../client';
import type { BusinessRole, BusinessRolePayload, WorkflowStep } from './types';

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
