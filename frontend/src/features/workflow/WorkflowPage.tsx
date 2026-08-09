import { useEffect, useMemo, useRef, useState } from 'react';
import { App as AntApp, Button, Checkbox, Col, Input, Modal, Row, Segmented, Space, Spin, Tag, Tooltip, Tree, Typography, Upload } from 'antd';
import type { DataNode } from 'antd/es/tree';
import { ApartmentOutlined, ArrowLeftOutlined, BranchesOutlined, ExportOutlined, GroupOutlined, ImportOutlined, PartitionOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import {
  createStep,
  createTransition,
  deleteStep,
  deleteTransition,
  exportWorkflow,
  fetchPhases,
  fetchRoles,
  fetchWorkflow,
  fetchWorkflowTree,
  updateStep,
  updateWorkflow,
  updateWorkflowFromImport,
  type ImportWorkflowPayload,
  type Transition,
  type WorkflowPhase,
  type WorkflowStep,
} from '../../api/workflow';
import { extractErrorMessage } from '../../api/client';
import { isAdmin, useAuthStore } from '../auth/authStore';
import { findStep } from './workflowUtils';
import { StepDetail } from './StepDetail';
import { StepFormModal, type StepFormValues } from './StepFormModal';
import { TransitionFormModal } from './TransitionFormModal';
import { PhaseManagerPanel } from './PhaseManagerPanel';
import { WorkflowGraph } from './WorkflowGraph';

type ViewMode = 'tree' | 'graph';
type TreeGrouping = 'hierarchy' | 'phase';

type StepModalState =
  | { mode: 'create-root' }
  | { mode: 'create-sub'; parent: WorkflowStep }
  | { mode: 'edit'; step: WorkflowStep }
  | null;

function toTreeData(steps: WorkflowStep[]): DataNode[] {
  return steps.map((step) => {
    const hasBranch = step.transitions.length > 1;
    const hasMeta = step.businessRoles.length > 0 || hasBranch;
    return {
      key: step.id,
      title: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '2px 0' }}>
          <span style={{ wordBreak: 'break-word', lineHeight: 1.35 }}>{step.name}</span>
          {hasMeta && (
            <Space size={6} wrap>
              {step.businessRoles.map((role) => (
                <Space key={role.id} size={4} style={{ lineHeight: 1 }}>
                  <span
                    style={{
                      display: 'inline-block',
                      width: 8,
                      height: 8,
                      borderRadius: 8,
                      background: role.color ?? '#bfbfbf',
                    }}
                  />
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {role.name}
                  </Typography.Text>
                </Space>
              ))}
              {hasBranch && (
                <Tooltip title="Branches into multiple next steps">
                  <BranchesOutlined style={{ color: '#1677ff', fontSize: 12 }} />
                </Tooltip>
              )}
            </Space>
          )}
        </div>
      ),
      children: step.children?.length ? toTreeData(step.children) : undefined,
    };
  });
}

/** Groups root steps under collapsible phase headers (ordered), with an Ungrouped bucket last. */
function toPhaseGroupedTreeData(rootSteps: WorkflowStep[], phases: WorkflowPhase[]): DataNode[] {
  const nodes: DataNode[] = [];
  [...phases]
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .forEach((phase) => {
      const members = rootSteps.filter((s) => s.phase?.id === phase.id);
      if (members.length === 0) return;
      nodes.push({
        key: `phase-${phase.id}`,
        selectable: false,
        title: (
          <Space size={6}>
            <span
              style={{
                display: 'inline-block',
                width: 9,
                height: 9,
                borderRadius: 9,
                background: phase.color ?? '#bfbfbf',
              }}
            />
            <span style={{ fontWeight: 600 }}>{phase.name}</span>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              ({members.length})
            </Typography.Text>
          </Space>
        ),
        children: toTreeData(members),
      });
    });
  const ungrouped = rootSteps.filter((s) => !s.phase);
  if (ungrouped.length > 0) {
    nodes.push({
      key: 'phase-none',
      selectable: false,
      title: (
        <Typography.Text type="secondary" style={{ fontWeight: 600 }}>
          Ungrouped ({ungrouped.length})
        </Typography.Text>
      ),
      children: toTreeData(ungrouped),
    });
  }
  return nodes;
}

export function WorkflowPage() {
  const { message } = AntApp.useApp();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { id } = useParams();
  const workflowId = Number(id);
  const admin = isAdmin(useAuthStore((s) => s.user));

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [view, setView] = useState<ViewMode>('tree');
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const [stepModal, setStepModal] = useState<StepModalState>(null);
  const [transitionFor, setTransitionFor] = useState<WorkflowStep | null>(null);
  const [phaseManagerOpen, setPhaseManagerOpen] = useState(false);
  const [treeGroup, setTreeGroup] = useState<TreeGrouping>('phase');
  const [exportOpen, setExportOpen] = useState(false);
  const [exportIncludePhases, setExportIncludePhases] = useState(false);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [updateText, setUpdateText] = useState('');

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
  const { data: phases = [] } = useQuery({
    queryKey: ['phases', workflowId],
    queryFn: () => fetchPhases(workflowId),
    enabled: Number.isFinite(workflowId),
  });

  const treeData = useMemo(() => toTreeData(tree), [tree]);
  const canGroupByPhase = phases.length > 0;
  const grouped = canGroupByPhase && treeGroup === 'phase';
  const groupedTreeData = useMemo(
    () => (grouped ? toPhaseGroupedTreeData(tree, phases) : []),
    [grouped, tree, phases],
  );
  const selectedStep = selectedId != null ? findStep(tree, selectedId) : null;

  // Auto-expand phase group headers once when entering the grouped view.
  const groupSeeded = useRef(false);
  useEffect(() => {
    if (!grouped) {
      groupSeeded.current = false;
      return;
    }
    if (!groupSeeded.current && groupedTreeData.length > 0) {
      const groupKeys = groupedTreeData.map((n) => n.key);
      setExpandedKeys((keys) => Array.from(new Set([...keys, ...groupKeys])));
      groupSeeded.current = true;
    }
  }, [grouped, groupedTreeData]);

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

  const runExport = useMutation({
    mutationFn: (includePhases: boolean) => exportWorkflow(workflowId, includePhases),
    onSuccess: (payload) => {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${(workflow?.name ?? 'workflow').replace(/[^\w.-]+/g, '_')}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setExportOpen(false);
      message.success('Workflow exported');
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to export workflow')),
  });

  const runUpdate = useMutation({
    mutationFn: (payload: ImportWorkflowPayload) => updateWorkflowFromImport(workflowId, payload),
    onSuccess: (wf) => {
      message.success(`Updated "${wf.name}"`);
      setUpdateOpen(false);
      setUpdateText('');
      setSelectedId(null);
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['workflows', workflowId] });
      queryClient.invalidateQueries({ queryKey: ['phases', workflowId] });
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to update workflow')),
  });

  const submitUpdate = () => {
    let payload: ImportWorkflowPayload;
    try {
      payload = JSON.parse(updateText) as ImportWorkflowPayload;
    } catch {
      message.error('Invalid JSON');
      return;
    }
    runUpdate.mutate(payload);
  };

  const onUpdateFile = (file: File) => {
    file.text().then((text) => setUpdateText(text));
    return false;
  };

  const navigateTo = (stepId: number) => {
    setSelectedId(stepId);
    setExpandedKeys((keys) => Array.from(new Set([...keys, stepId])));
  };

  let modalTitle = 'Add root step';
  if (stepModal?.mode === 'edit') {
    modalTitle = 'Edit step';
  } else if (stepModal?.mode === 'create-sub') {
    modalTitle = `Add sub-step under "${stepModal.parent.name}"`;
  }

  const emptyHint = (
    <Typography.Text type="secondary">
      No steps yet.{admin ? ' Use "Add root step" to begin.' : ''}
    </Typography.Text>
  );

  let leftPanel: React.ReactNode;
  if (treeData.length === 0) {
    leftPanel = (
      <div style={{ border: '1px solid rgba(5,5,5,0.06)', borderRadius: 8, padding: 12 }}>{emptyHint}</div>
    );
  } else if (view === 'graph') {
    leftPanel = (
      <WorkflowGraph
        tree={tree}
        phases={phases}
        entryStepId={workflow?.entryStepId}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />
    );
  } else {
    leftPanel = (
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        {canGroupByPhase && (
          <Segmented
            size="small"
            value={treeGroup}
            onChange={(v) => setTreeGroup(v as TreeGrouping)}
            options={[
              { label: 'Hierarchy', value: 'hierarchy' },
              { label: 'By phase', value: 'phase' },
            ]}
          />
        )}
        <div style={{ border: '1px solid rgba(5,5,5,0.06)', borderRadius: 8, padding: 12 }}>
          <Tree
            showLine
            blockNode
            treeData={grouped ? groupedTreeData : treeData}
            selectedKeys={selectedId != null ? [selectedId] : []}
            expandedKeys={expandedKeys}
            onExpand={(keys) => setExpandedKeys(keys)}
            onSelect={(keys) => setSelectedId(keys.length ? Number(keys[0]) : null)}
          />
        </div>
      </Space>
    );
  }

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
        <Space>
          <Segmented
            value={view}
            onChange={(v) => setView(v as ViewMode)}
            options={[
              { label: 'Tree', value: 'tree', icon: <ApartmentOutlined /> },
              { label: 'Graph', value: 'graph', icon: <PartitionOutlined /> },
            ]}
          />
          <Button icon={<ExportOutlined />} onClick={() => setExportOpen(true)}>
            Export
          </Button>
          {admin && (
            <Button icon={<ImportOutlined />} onClick={() => setUpdateOpen(true)}>
              Update from JSON
            </Button>
          )}
          {admin && (
            <Button icon={<GroupOutlined />} onClick={() => setPhaseManagerOpen(true)}>
              Phases
            </Button>
          )}
          {admin && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setStepModal({ mode: 'create-root' })}>
              Add root step
            </Button>
          )}
        </Space>
      </Row>

      {isLoading ? (
        <Spin />
      ) : (
        <Row gutter={16}>
          <Col xs={24} md={view === 'graph' ? 15 : 10} lg={view === 'graph' ? 16 : 9}>
            {leftPanel}
          </Col>
          <Col xs={24} md={view === 'graph' ? 9 : 14} lg={view === 'graph' ? 8 : 15}>
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
        phases={phases}
        initial={stepModal?.mode === 'edit' ? stepModal.step : null}
        confirmLoading={saveStep.isPending}
        onCancel={() => setStepModal(null)}
        onSubmit={(values) => saveStep.mutate(values)}
      />

      <Modal
        open={phaseManagerOpen}
        title="Manage phases"
        footer={null}
        width={720}
        onCancel={() => setPhaseManagerOpen(false)}
      >
        <PhaseManagerPanel workflowId={workflowId} phases={phases} editable={admin} />
      </Modal>

      <Modal
        open={exportOpen}
        title="Export workflow as JSON"
        okText="Download"
        confirmLoading={runExport.isPending}
        onCancel={() => setExportOpen(false)}
        onOk={() => runExport.mutate(exportIncludePhases)}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Typography.Text type="secondary">
            Steps, roles and branching are always included. Phases are optional and off by default.
          </Typography.Text>
          <Checkbox checked={exportIncludePhases} onChange={(e) => setExportIncludePhases(e.target.checked)}>
            Include phases
          </Checkbox>
        </Space>
      </Modal>

      <Modal
        open={updateOpen}
        title="Update this workflow from JSON"
        okText="Update"
        confirmLoading={runUpdate.isPending}
        onCancel={() => setUpdateOpen(false)}
        onOk={submitUpdate}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Typography.Text type="secondary">
            Steps are matched by their exported ref: unchanged ones are updated in place, new ones are
            added, and steps missing from the file are removed. When the JSON has no phases, existing
            phases are kept — new steps inherit their parent's phase.
          </Typography.Text>
          <Upload accept=".json,application/json" showUploadList={false} beforeUpload={onUpdateFile}>
            <Button icon={<ImportOutlined />}>Choose JSON file</Button>
          </Upload>
          <Input.TextArea
            value={updateText}
            onChange={(e) => setUpdateText(e.target.value)}
            rows={10}
            placeholder="Paste workflow JSON here"
          />
        </Space>
      </Modal>

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
