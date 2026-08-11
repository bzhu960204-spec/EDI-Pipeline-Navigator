export type WorkflowStatus = 'DRAFT' | 'PUBLISHED';

export interface WorkflowFolder {
  id: number;
  name: string;
  color?: string | null;
  description?: string | null;
  orderIndex: number;
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
  folderId?: number | null;
  stepCount: number;
  confidence: number;
  tags: string[];
}

export interface WorkflowPayload {
  name: string;
  description?: string;
  status?: WorkflowStatus;
  folderId?: number | null;
  tags?: string[];
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
  /** Condition group this edge belongs to; edges sharing a group start together (AND). */
  groupId: number | null;
  groupOrderIndex: number;
  /** Co-fire group this edge joins on arrival; edges sharing it must all fire before the target starts (AND). */
  coFireGroupId: number | null;
}

export interface StepReview {
  id: number;
  stepId: number;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export type StepFlagLevel = 'critical' | 'important' | 'review-later';

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
  reviews: StepReview[];
  children: WorkflowStep[];
  transitions: Transition[];
  /** Personal importance mark; local to this workflow version and never exported. */
  flag?: StepFlagLevel | null;
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

export interface CreateTransitionPayload {
  fromStepId: number;
  toStepId: number;
  label?: string;
}

export interface CreateTransitionGroupPayload {
  fromStepId: number;
  toStepIds: number[];
  label?: string;
}

export interface UpdateTransitionGroupPayload {
  label?: string | null;
  toStepIds: number[];
}

export interface CoFireGroupPayload {
  transitionIds: number[];
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
  reviews?: ImportReviewNode[];
  children?: ImportStepNode[];
}

export interface ImportReviewNode {
  content: string;
  createdAt?: string;
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
  coFireGroup?: string;
}

export interface ImportWorkflowPayload {
  name: string;
  description?: string;
  status?: WorkflowStatus;
  confidence?: number;
  tags?: string[];
  phases?: ImportPhaseNode[];
  steps?: ImportStepNode[];
  transitions?: ImportTransition[];
}

export interface WorkflowFolderPayload {
  name: string;
  color?: string;
  description?: string;
  orderIndex?: number;
}
