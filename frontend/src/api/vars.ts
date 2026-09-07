import { api } from './client';

export interface VarTable {
  id: number;
  name: string;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
}

export interface Variable {
  id: number;
  keyName: string;
  value: string;
  orderIndex: number;
}

export interface VarTableInput {
  name: string;
}

export interface VariableInput {
  keyName: string;
  value: string;
}

export async function fetchVarTables(artifactId: number): Promise<VarTable[]> {
  const { data } = await api.get<VarTable[]>(`/artifacts/${artifactId}/var-tables`);
  return data;
}

export async function createVarTable(artifactId: number, input: VarTableInput): Promise<VarTable> {
  const { data } = await api.post<VarTable>(`/artifacts/${artifactId}/var-tables`, input);
  return data;
}

export async function renameVarTable(
  artifactId: number,
  tableId: number,
  input: VarTableInput,
): Promise<VarTable> {
  const { data } = await api.put<VarTable>(`/artifacts/${artifactId}/var-tables/${tableId}`, input);
  return data;
}

export async function deleteVarTable(artifactId: number, tableId: number): Promise<void> {
  await api.delete(`/artifacts/${artifactId}/var-tables/${tableId}`);
}

export async function reorderVarTables(
  artifactId: number,
  orderedIds: number[],
): Promise<VarTable[]> {
  const { data } = await api.put<VarTable[]>(`/artifacts/${artifactId}/var-tables/reorder`, {
    orderedIds,
  });
  return data;
}

export async function fetchVars(artifactId: number, tableId: number): Promise<Variable[]> {
  const { data } = await api.get<Variable[]>(`/artifacts/${artifactId}/var-tables/${tableId}/vars`);
  return data;
}

export async function createVar(
  artifactId: number,
  tableId: number,
  input: VariableInput,
): Promise<Variable> {
  const { data } = await api.post<Variable>(
    `/artifacts/${artifactId}/var-tables/${tableId}/vars`,
    input,
  );
  return data;
}

export async function updateVar(
  artifactId: number,
  tableId: number,
  varId: number,
  input: VariableInput,
): Promise<Variable> {
  const { data } = await api.put<Variable>(
    `/artifacts/${artifactId}/var-tables/${tableId}/vars/${varId}`,
    input,
  );
  return data;
}

export async function deleteVar(
  artifactId: number,
  tableId: number,
  varId: number,
): Promise<void> {
  await api.delete(`/artifacts/${artifactId}/var-tables/${tableId}/vars/${varId}`);
}

export async function reorderVars(
  artifactId: number,
  tableId: number,
  orderedIds: number[],
): Promise<Variable[]> {
  const { data } = await api.put<Variable[]>(
    `/artifacts/${artifactId}/var-tables/${tableId}/vars/reorder`,
    { orderedIds },
  );
  return data;
}
