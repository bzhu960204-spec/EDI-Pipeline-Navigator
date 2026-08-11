import type { StepFlagLevel } from '../../api/workflow';

export interface StepFlagMeta {
  level: StepFlagLevel;
  label: string;
  /** Solid dot / marker color (hex) used in tree and graph. */
  color: string;
  /** Ant Design Tag color token. */
  tagColor: string;
}

// Ordered from most to least urgent; drives the picker and any sorting.
export const STEP_FLAG_META: StepFlagMeta[] = [
  { level: 'critical', label: 'Needs Fix', color: '#ff4d4f', tagColor: 'red' },
  { level: 'important', label: 'Important', color: '#faad14', tagColor: 'gold' },
  { level: 'review-later', label: 'Review Later', color: '#8c8c8c', tagColor: 'default' },
];

export function flagMeta(level: StepFlagLevel | null | undefined): StepFlagMeta | undefined {
  return level ? STEP_FLAG_META.find((m) => m.level === level) : undefined;
}
