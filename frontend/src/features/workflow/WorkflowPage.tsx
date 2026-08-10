import { useEffect, useMemo, useRef, useState } from 'react';
import { App as AntApp, Button, Checkbox, Col, Collapse, Dropdown, Input, Modal, Row, Segmented, Space, Spin, Tag, Tree, Typography, Upload } from 'antd';
import type { MenuProps } from 'antd';
import { ApartmentOutlined, ArrowLeftOutlined, BranchesOutlined, CheckOutlined, DownOutlined, ExportOutlined, GroupOutlined, ImportOutlined, InboxOutlined, MoreOutlined, PartitionOutlined, PlusOutlined, StarOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import {
  addReview,
  createStep,
  createTransition,
  deleteReview,
  deleteStep,
  deleteTransition,
  exportWorkflow,
  fetchPhases,
  fetchRoles,
  fetchVersions,
  fetchWorkflow,
  fetchWorkflowTree,
  setCurrentVersion,
  updateReview,
  updateStep,
  updateWorkflowFromImport,
  type ImportWorkflowPayload,
  type Transition,
  type WorkflowStep,
} from '../../api/workflow';
import { extractErrorMessage } from '../../api/client';
import { isAdmin, useAuthStore } from '../auth/authStore';
import { buildIncomingIndex, findStep } from './workflowUtils';
import { useFlowNavigation } from './useFlowNavigation';
import { colorForTag } from './tagColor';
import { StepDetail } from './StepDetail';
import { StepFormModal, type StepFormValues } from './StepFormModal';
import { TransitionFormModal } from './TransitionFormModal';
import { PhaseManagerPanel } from './PhaseManagerPanel';
import { WorkflowGraph } from './WorkflowGraph';
import { VersionManagerModal } from './VersionManagerModal';
import { toPhaseGroupedTreeData, toTreeData } from './workflowTreeData';

type ViewMode = 'tree' | 'graph';
type TreeGrouping = 'hierarchy' | 'phase';

type StepModalState =
  | { mode: 'create-root' }
  | { mode: 'create-sub'; parent: WorkflowStep }
  | { mode: 'edit'; step: WorkflowStep }
  | null;

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
  const [exportIncludeReviews, setExportIncludeReviews] = useState(false);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [updateText, setUpdateText] = useState('');
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [navFocused, setNavFocused] = useState(false);

  const { data: workflow } = useQuery({
    queryKey: ['workflows', workflowId],
    queryFn: () => fetchWorkflow(workflowId),
    enabled: Number.isFinite(workflowId),
  });
  const { data: versions = [] } = useQuery({
    queryKey: ['versions', workflowId],
    queryFn: () => fetchVersions(workflowId),
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
  const incomingIndex = useMemo(() => buildIncomingIndex(tree), [tree]);

  // childId -> parentId across the whole tree, for expanding a target's ancestor chain on navigate.
  const parentMap = useMemo(() => {
    const map = new Map<number, number>();
    const walk = (list: WorkflowStep[], parent: number | null) => {
      list.forEach((s) => {
        if (parent != null) map.set(s.id, parent);
        if (s.children?.length) walk(s.children, s.id);
      });
    };
    walk(tree, null);
    return map;
  }, [tree]);

  const treeScrollRef = useRef<HTMLDivElement>(null);

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

  // Bring the selected tree node into view after any programmatic selection/expansion.
  useEffect(() => {
    if (view !== 'tree' || selectedId == null) return;
    const raf = requestAnimationFrame(() => {
      treeScrollRef.current
        ?.querySelector('.ant-tree-node-selected')
        ?.scrollIntoView({ block: 'nearest' });
    });
    return () => cancelAnimationFrame(raf);
  }, [selectedId, expandedKeys, view]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['workflow', workflowId] });

  const promote = useMutation({
    mutationFn: (versionId: number) => setCurrentVersion(versionId),
    onSuccess: () => {
      message.success('Current version updated');
      queryClient.invalidateQueries({ queryKey: ['versions', workflowId] });
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      queryClient.invalidateQueries({ queryKey: ['workflows', workflowId] });
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to set current version')),
  });

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

  const addReviewM = useMutation({
    mutationFn: ({ stepId, content }: { stepId: number; content: string }) => addReview(stepId, content),
    onSuccess: () => {
      message.success('Review added');
      invalidate();
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to add review')),
  });

  const updateReviewM = useMutation({
    mutationFn: ({ id, content }: { id: number; content: string }) => updateReview(id, content),
    onSuccess: () => {
      message.success('Review updated');
      invalidate();
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to update review')),
  });

  const removeReviewM = useMutation({
    mutationFn: (id: number) => deleteReview(id),
    onSuccess: () => {
      message.success('Review removed');
      invalidate();
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to remove review')),
  });

  const runExport = useMutation({
    mutationFn: ({ includePhases, includeReviews }: { includePhases: boolean; includeReviews: boolean }) =>
      exportWorkflow(workflowId, includePhases, includeReviews),
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
    const keys: React.Key[] = [];
    let cur = parentMap.get(stepId);
    while (cur != null) {
      keys.push(cur);
      cur = parentMap.get(cur);
    }
    if (grouped) {
      let root = stepId;
      let p = parentMap.get(root);
      while (p != null) {
        root = p;
        p = parentMap.get(root);
      }
      const rootStep = findStep(tree, root);
      keys.push(rootStep?.phase ? `phase-${rootStep.phase.id}` : 'phase-none');
    }
    setExpandedKeys((prev) => Array.from(new Set([...prev, ...keys])));
  };

  const { picker, onKeyDown } = useFlowNavigation({
    tree,
    selectedId,
    selectedStep,
    incomingIndex,
    navigateTo,
    enabled: view === 'tree',
  });

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

  const headerMenuItems: MenuProps['items'] = [
    { key: 'export', icon: <ExportOutlined />, label: 'Export', onClick: () => setExportOpen(true) },
    ...(admin
      ? [
          { key: 'update', icon: <ImportOutlined />, label: 'Update from JSON', onClick: () => setUpdateOpen(true) },
          { key: 'phases', icon: <GroupOutlined />, label: 'Phases', onClick: () => setPhaseManagerOpen(true) },
        ]
      : []),
  ];

  const versionMenuItems: MenuProps['items'] = [
    ...versions.map((v) => ({
      key: `v-${v.id}`,
      icon: v.id === workflowId ? <CheckOutlined /> : <span style={{ display: 'inline-block', width: 14 }} />,
      label: (
        <Space size={6}>
          <span style={{ fontWeight: v.isCurrent ? 600 : 400 }}>v{v.version}</span>
          {v.isCurrent && <Tag color="blue" style={{ marginInlineEnd: 0 }}>current</Tag>}
          {v.versionLabel && (
            <Typography.Text type="secondary" ellipsis style={{ maxWidth: 160 }}>
              {v.versionLabel}
            </Typography.Text>
          )}
        </Space>
      ),
      onClick: () => {
        if (v.id !== workflowId) navigate(`/workflow/edit/${v.id}`);
      },
    })),
    { type: 'divider' as const },
    ...(admin && workflow && !workflow.isCurrent
      ? [
          {
            key: 'set-current',
            icon: <StarOutlined />,
            label: 'Set this version as current',
            onClick: () => promote.mutate(workflowId),
          },
        ]
      : []),
    { key: 'manage', icon: <BranchesOutlined />, label: 'Manage versions\u2026', onClick: () => setVersionsOpen(true) },
  ];

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
        selectedId={selectedId}
        onSelect={setSelectedId}
      />
    );
  } else {
    leftPanel = (
      <div
        ref={treeScrollRef}
        tabIndex={0}
        role="tree"
        aria-label="Workflow steps — use arrow keys to navigate"
        onKeyDownCapture={onKeyDown}
        onFocus={() => setNavFocused(true)}
        onBlur={() => setNavFocused(false)}
        style={{
          border: '1px solid rgba(5,5,5,0.06)',
          borderRadius: 8,
          padding: 12,
          outline: 'none',
          boxShadow: navFocused ? '0 0 0 2px rgba(22,119,255,0.35)' : undefined,
          transition: 'box-shadow 0.15s',
        }}
      >
        <Tree
          showLine
          blockNode
          treeData={grouped ? groupedTreeData : treeData}
          selectedKeys={selectedId != null ? [selectedId] : []}
          expandedKeys={expandedKeys}
          onExpand={(keys) => setExpandedKeys(keys)}
          onSelect={(keys) => setSelectedId(keys.length ? Number(keys[0]) : null)}
        />
        <Typography.Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
          Keyboard: ↑/↓ browse · → / Enter next (pick a branch) · ← back · Esc cancel · Home entry
        </Typography.Text>
      </div>
    );
  }

  return (
    <div>
      <Row wrap={false} align="middle" gutter={16} style={{ marginBottom: 16 }}>
        <Col flex="auto" style={{ minWidth: 0 }}>
          <Space style={{ maxWidth: '100%' }}>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/workflow')}>
              Workflows
            </Button>
            <Typography.Title
              level={4}
              style={{ margin: 0, minWidth: 0 }}
              ellipsis={{ tooltip: workflow?.name }}
            >
              {workflow?.name ?? 'Workflow'}
            </Typography.Title>
            {workflow && (
              <Dropdown menu={{ items: versionMenuItems }} trigger={['click']}>
                <Tag
                  color={workflow.isCurrent ? 'blue' : 'default'}
                  style={{ marginInlineEnd: 0, flexShrink: 0, cursor: 'pointer', userSelect: 'none' }}
                >
                  v{workflow.version}
                  {workflow.isCurrent ? ' · current' : ''}
                  <DownOutlined style={{ fontSize: 10, marginInlineStart: 4 }} />
                </Tag>
              </Dropdown>
            )}
            {workflow && (
              <Tag color={workflow.status === 'PUBLISHED' ? 'green' : 'default'} style={{ marginInlineEnd: 0, flexShrink: 0 }}>
                {workflow.status}
              </Tag>
            )}
          </Space>
        </Col>
        <Col flex="none">
          <Space>
            {view === 'tree' && canGroupByPhase && (
              <Segmented
                value={treeGroup}
                onChange={(v) => setTreeGroup(v as TreeGrouping)}
                options={[
                  { label: 'Hierarchy', value: 'hierarchy' },
                  { label: 'By phase', value: 'phase' },
                ]}
              />
            )}
            <Segmented
              value={view}
              onChange={(v) => setView(v as ViewMode)}
              options={[
                { label: 'Tree', value: 'tree', icon: <ApartmentOutlined /> },
                { label: 'Graph', value: 'graph', icon: <PartitionOutlined /> },
              ]}
            />
            <Dropdown menu={{ items: headerMenuItems }} trigger={['click']}>
              <Button icon={<MoreOutlined />}>Actions</Button>
            </Dropdown>
            {admin && (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setStepModal({ mode: 'create-root' })}>
                Add root step
              </Button>
            )}
          </Space>
        </Col>
      </Row>

      {workflow && (workflow.description || workflow.tags.length > 0) && (
        <Collapse
          ghost
          defaultActiveKey={workflow.description ? ['info'] : []}
          style={{ marginBottom: 8 }}
          items={[
            {
              key: 'info',
              label: 'Workflow details',
              children: (
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  {workflow.description ? (
                    <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>
                      {workflow.description}
                    </Typography.Paragraph>
                  ) : (
                    <Typography.Text type="secondary">No description.</Typography.Text>
                  )}
                  {workflow.tags.length > 0 && (
                    <Space size={4} wrap>
                      {workflow.tags.map((t) => (
                        <Tag key={t} color={colorForTag(t)} style={{ marginInlineEnd: 0 }}>
                          {t}
                        </Tag>
                      ))}
                    </Space>
                  )}
                </Space>
              ),
            },
          ]}
        />
      )}

      {isLoading ? (
        <Spin />
      ) : (
        <Row gutter={16}>
          <Col xs={24} md={view === 'graph' ? 15 : 10} lg={view === 'graph' ? 16 : 9}>
            {leftPanel}
          </Col>
          <Col xs={24} md={view === 'graph' ? 9 : 14} lg={view === 'graph' ? 8 : 15}>
            <div style={{ position: 'sticky', top: 16 }}>
            <StepDetail
              step={selectedStep}
              isAdmin={admin}
              isEntry={selectedStep?.id === tree[0]?.id}
              incoming={selectedStep ? (incomingIndex.get(selectedStep.id) ?? []) : []}
              pickerDirection={view === 'tree' ? picker?.direction : undefined}
              pickerIndex={view === 'tree' ? picker?.index : undefined}
              onEdit={() => selectedStep && setStepModal({ mode: 'edit', step: selectedStep })}
              onAddSub={() => selectedStep && setStepModal({ mode: 'create-sub', parent: selectedStep })}
              onAddTransition={() => setTransitionFor(selectedStep)}
              onDelete={() => selectedStep && removeStep.mutate(selectedStep.id)}
              onDeleteTransition={(t) => removeTransition.mutate(t)}
              onNavigate={navigateTo}
              onAddReview={(content) => selectedStep && addReviewM.mutate({ stepId: selectedStep.id, content })}
              onUpdateReview={(id, content) => updateReviewM.mutate({ id, content })}
              onDeleteReview={(id) => removeReviewM.mutate(id)}
            />
            </div>
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
        onOk={() => runExport.mutate({ includePhases: exportIncludePhases, includeReviews: exportIncludeReviews })}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Typography.Text type="secondary">
            Steps, roles and branching are always included. Phases and reviews are optional and off by default.
          </Typography.Text>
          <Checkbox checked={exportIncludePhases} onChange={(e) => setExportIncludePhases(e.target.checked)}>
            Include phases
          </Checkbox>
          <Checkbox checked={exportIncludeReviews} onChange={(e) => setExportIncludeReviews(e.target.checked)}>
            Include reviews
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
          <Upload.Dragger accept=".json,application/json" showUploadList={false} beforeUpload={onUpdateFile}>
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">Drag a JSON file here, or click to browse</p>
          </Upload.Dragger>
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

      {versionsOpen && (
        <VersionManagerModal
          open
          workflowId={workflowId}
          admin={admin}
          onClose={() => setVersionsOpen(false)}
        />
      )}
    </div>
  );
}
