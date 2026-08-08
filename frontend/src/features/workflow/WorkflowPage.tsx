import { useMemo, useState } from 'react';
import { App as AntApp, Button, Col, Row, Space, Spin, Tag, Tree, Typography } from 'antd';
import type { DataNode } from 'antd/es/tree';
import { ArrowLeftOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import {
  createStep,
  createTransition,
  deleteStep,
  deleteTransition,
  fetchRoles,
  fetchWorkflow,
  fetchWorkflowTree,
  updateStep,
  updateWorkflow,
  type Transition,
  type WorkflowStep,
} from '../../api/workflow';
import { extractErrorMessage } from '../../api/client';
import { isAdmin, useAuthStore } from '../auth/authStore';
import { findStep } from './workflowUtils';
import { StepDetail } from './StepDetail';
import { StepFormModal, type StepFormValues } from './StepFormModal';
import { TransitionFormModal } from './TransitionFormModal';

type StepModalState =
  | { mode: 'create-root' }
  | { mode: 'create-sub'; parent: WorkflowStep }
  | { mode: 'edit'; step: WorkflowStep }
  | null;

function toTreeData(steps: WorkflowStep[]): DataNode[] {
  return steps.map((step) => ({
    key: step.id,
    title: (
      <Space size={4}>
        <span>{step.name}</span>
        {step.businessRole && (
          <Tag color={step.businessRole.color ?? undefined} style={{ marginInlineEnd: 0 }}>
            {step.businessRole.name}
          </Tag>
        )}
        {step.transitions.length > 1 && <Tag color="blue">branch</Tag>}
      </Space>
    ),
    children: step.children?.length ? toTreeData(step.children) : undefined,
  }));
}

export function WorkflowPage() {
  const { message } = AntApp.useApp();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { id } = useParams();
  const workflowId = Number(id);
  const admin = isAdmin(useAuthStore((s) => s.user));

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const [stepModal, setStepModal] = useState<StepModalState>(null);
  const [transitionFor, setTransitionFor] = useState<WorkflowStep | null>(null);

  const { data: workflow } = useQuery({
    queryKey: ['workflows', workflowId],
    queryFn: () => fetchWorkflow(workflowId),
    enabled: Number.isFinite(workflowId),
  });
  const { data: tree = [], isLoading } = useQuery({
    queryKey: ['workflow', workflowId, 'tree'],
    queryFn: () => fetchWorkflowTree(workflowId),
    enabled: Number.isFinite(workflowId),
  });
  const { data: roles = [] } = useQuery({ queryKey: ['roles'], queryFn: fetchRoles });

  const treeData = useMemo(() => toTreeData(tree), [tree]);
  const selectedStep = selectedId != null ? findStep(tree, selectedId) : null;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['workflow', workflowId] });

  const saveStep = useMutation({
    mutationFn: (values: StepFormValues) => {
      if (stepModal?.mode === 'edit') {
        return updateStep(stepModal.step.id, values);
      }
      const parentId = stepModal?.mode === 'create-sub' ? stepModal.parent.id : null;
      return createStep({ ...values, parentId, workflowId });
    },
    onSuccess: (saved) => {
      message.success('Step saved');
      setStepModal(null);
      setSelectedId(saved.id);
      invalidate();
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to save step')),
  });

  const removeStep = useMutation({
    mutationFn: (id: number) => deleteStep(id),
    onSuccess: () => {
      message.success('Step deleted');
      setSelectedId(null);
      invalidate();
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to delete step')),
  });

  const addTransition = useMutation({
    mutationFn: (values: { toStepId: number; label?: string }) =>
      createTransition({ fromStepId: transitionFor!.id, toStepId: values.toStepId, label: values.label }),
    onSuccess: () => {
      message.success('Transition added');
      setTransitionFor(null);
      invalidate();
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to add transition')),
  });

  const removeTransition = useMutation({
    mutationFn: (t: Transition) => deleteTransition(t.id),
    onSuccess: () => {
      message.success('Transition removed');
      invalidate();
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to remove transition')),
  });

  const setEntry = useMutation({
    mutationFn: (stepId: number) => {
      if (!workflow) {
        return Promise.reject(new Error('Workflow not loaded'));
      }
      return updateWorkflow(workflowId, {
        name: workflow.name,
        description: workflow.description ?? undefined,
        type: workflow.type,
        status: workflow.status,
        entryStepId: stepId,
      });
    },
    onSuccess: () => {
      message.success('Entry step set');
      queryClient.invalidateQueries({ queryKey: ['workflows', workflowId] });
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to set entry step')),
  });

  const navigateTo = (stepId: number) => {
    setSelectedId(stepId);
    setExpandedKeys((keys) => Array.from(new Set([...keys, stepId])));
  };

  const modalTitle =
    stepModal?.mode === 'edit'
      ? 'Edit step'
      : stepModal?.mode === 'create-sub'
        ? `Add sub-step under "${stepModal.parent.name}"`
        : 'Add root step';

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/workflow')}>
            Sub-Workflows
          </Button>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {workflow?.name ?? 'Workflow'}
          </Typography.Title>
          {workflow && <Tag color={workflow.status === 'PUBLISHED' ? 'green' : 'default'}>{workflow.status}</Tag>}
        </Space>
        {admin && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setStepModal({ mode: 'create-root' })}>
            Add root step
          </Button>
        )}
      </Row>

      {isLoading ? (
        <Spin />
      ) : (
        <Row gutter={16}>
          <Col xs={24} md={10} lg={9}>
            <div style={{ border: '1px solid rgba(5,5,5,0.06)', borderRadius: 8, padding: 12 }}>
              {treeData.length === 0 ? (
                <Typography.Text type="secondary">
                  No steps yet.{admin ? ' Use "Add root step" to begin.' : ''}
                </Typography.Text>
              ) : (
                <Tree
                  showLine
                  blockNode
                  treeData={treeData}
                  selectedKeys={selectedId != null ? [selectedId] : []}
                  expandedKeys={expandedKeys}
                  onExpand={(keys) => setExpandedKeys(keys)}
                  onSelect={(keys) => setSelectedId(keys.length ? Number(keys[0]) : null)}
                />
              )}
            </div>
          </Col>
          <Col xs={24} md={14} lg={15}>
            <StepDetail
              step={selectedStep}
              isAdmin={admin}
              isEntry={workflow?.entryStepId != null && workflow.entryStepId === selectedStep?.id}
              onEdit={() => selectedStep && setStepModal({ mode: 'edit', step: selectedStep })}
              onAddSub={() => selectedStep && setStepModal({ mode: 'create-sub', parent: selectedStep })}
              onAddTransition={() => setTransitionFor(selectedStep)}
              onDelete={() => selectedStep && removeStep.mutate(selectedStep.id)}
              onDeleteTransition={(t) => removeTransition.mutate(t)}
              onNavigate={navigateTo}
              onSetEntry={() => selectedStep && setEntry.mutate(selectedStep.id)}
            />
          </Col>
        </Row>
      )}

      <StepFormModal
        open={stepModal != null}
        title={modalTitle}
        roles={roles}
        initial={stepModal?.mode === 'edit' ? stepModal.step : null}
        confirmLoading={saveStep.isPending}
        onCancel={() => setStepModal(null)}
        onSubmit={(values) => saveStep.mutate(values)}
      />

      <TransitionFormModal
        open={transitionFor != null}
        fromStep={transitionFor}
        tree={tree}
        confirmLoading={addTransition.isPending}
        onCancel={() => setTransitionFor(null)}
        onSubmit={(values) => addTransition.mutate(values)}
      />
    </div>
  );
}
