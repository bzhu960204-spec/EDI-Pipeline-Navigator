import { api } from '../client';
import type { StepReview } from './types';

export async function addReview(stepId: number, content: string): Promise<StepReview> {
  const { data } = await api.post<StepReview>(`/workflow/steps/${stepId}/reviews`, { content });
  return data;
}

export async function updateReview(reviewId: number, content: string): Promise<StepReview> {
  const { data } = await api.put<StepReview>(`/workflow/reviews/${reviewId}`, { content });
  return data;
}

export async function deleteReview(reviewId: number): Promise<void> {
  await api.delete(`/workflow/reviews/${reviewId}`);
}
