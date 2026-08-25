import { api } from './client';

export interface LogEntry {
  id: number;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface LogInput {
  title: string;
  content: string;
}

export async function fetchLogs(artifactId: number): Promise<LogEntry[]> {
  const { data } = await api.get<LogEntry[]>(`/artifacts/${artifactId}/logs`);
  return data;
}

export async function createLog(artifactId: number, input: LogInput): Promise<LogEntry> {
  const { data } = await api.post<LogEntry>(`/artifacts/${artifactId}/logs`, input);
  return data;
}

export async function updateLog(
  artifactId: number,
  logId: number,
  input: LogInput,
): Promise<LogEntry> {
  const { data } = await api.put<LogEntry>(`/artifacts/${artifactId}/logs/${logId}`, input);
  return data;
}

export async function deleteLog(artifactId: number, logId: number): Promise<void> {
  await api.delete(`/artifacts/${artifactId}/logs/${logId}`);
}
