import { useEffect, useMemo, useRef, useState } from 'react';
import {
  App as AntApp,
  Button,
  Checkbox,
  Dropdown,
  Empty,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Tag,
  theme,
  Tree,
  Typography,
} from 'antd';
import type { TreeDataNode, TreeProps } from 'antd';
import {
  BranchesOutlined,
  CloseOutlined,
  DeleteOutlined,
  DownOutlined,
  PlusOutlined,
  SaveOutlined,
  SubnodeOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  createVersion,
  exportWorkflow,
  fetchWorkflowTree,
  setCurrentVersion,
  setStepFlag,
  updateWorkflowFromImport,
  type BusinessRole,
  type ImportStepNode,
  type StepFlagLevel,
  type WorkflowPhase,
  type WorkflowStep,
} from '../../api/workflow';
import { extractErrorMessage } from '../../api/client';
import {
  attachReviews,
  buildDraft,
  collectRefs,
  collectReviewsByRef,
  findStep,
  isDescendant,
  makeTempRef,
  phaseIdToRef,
  phaseRefToId,
  removeStep,
  serializeDraft,
  type EditorDraft,
} from './workflowEditorModel';

interface WorkflowEditorModalProps {
  open: boolean;
  workflowId: number;
  workflowName: string;
  roles: BusinessRole[];
  phases: WorkflowPhase[];
  onClose: () => void;
  onSaved: (newCurrentId?: number) => void;
}

const backupKey = (workflowId: number) => `wf-editor-draft-${workflowId}`;

/** Copies personal flags from one version to another, matched by the cross-version lineage key. */
async function copyFlags(sourceId: number, targetId: number): Promise<void> {
  const [srcTree, tgtTree] = await Promise.all([
    fetchWorkflowTree(sourceId),
    fetchWorkflowTree(targetId),
  ]);
  const flagByLineage = new Map<string, StepFlagLevel>();
  const walkSrc = (list: WorkflowStep[]) => {
    list.forEach((s) => {
      if (s.flag && s.lineageKey) flagByLineage.set(s.lineageKey, s.flag);
      if (s.children?.length) walkSrc(s.children);
    });
  };
  walkSrc(srcTree);
  if (flagByLineage.size === 0) return;
  const targetIdByLineage = new Map<string, number>();
  const walkTgt = (list: WorkflowStep[]) => {
    list.forEach((s) => {
      if (s.lineageKey) targetIdByLineage.set(s.lineageKey, s.id);
      if (s.children?.length) walkTgt(s.children);
    });
  };
  walkTgt(tgtTree);
  await Promise.all(
    Array.from(flagByLineage.entries()).flatMap(([lineage, level]) => {
      const id = targetIdByLineage.get(lineage);
      return id != null ? [setStepFlag(id, level)] : [];
    }),
  );
}

/** Finds the sibling list and index that holds the given ref. */
function locate(
  steps: ImportStepNode[],
  ref: string,
): { list: ImportStepNode[]; index: number } | null {
  const idx = steps.findIndex((s) => s.ref === ref);
  if (idx >= 0) return { list: steps, index: idx };
  for (const s of steps) {
    if (s.children?.length) {
      const hit = locate(s.children, ref);
      if (hit) return hit;
    }
  }
  return null;
}

export function WorkflowEditorModal({
  open,
  workflowId,
  workflowName,
  roles,
  phases,
  onClose,
  onSaved,
}: Readonly<WorkflowEditorModalProps>) {
  const { message, modal } = AntApp.useApp();
  const { token } = theme.useToken();
  const [draft, setDraft] = useState<EditorDraft | null>(null);
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  // Options dialog shown when saving as a new version.
  const [newVersionOpen, setNewVersionOpen] = useState(false);
  const [copyReviews, setCopyReviews] = useState(true);
  const [copyFlagsOpt, setCopyFlagsOpt] = useState(true);
  // JSON snapshot of the payload as first loaded, to detect unsaved edits.
  const baseline = useRef<string>('');

  const { data: exported, isFetching } = useQuery({
    queryKey: ['wf-export', workflowId],
    queryFn: () => exportWorkflow(workflowId, true, false),
    enabled: open,
    staleTime: 0,
    gcTime: 0,
  });

  // Seed the draft once per open, offering to restore a local backup when one exists.
  useEffect(() => {
    if (!open || !exported) return;
    const fresh = buildDraft(exported);
    baseline.current = JSON.stringify(serializeDraft(fresh));
    const allRefs = Array.from(collectRefs(fresh.steps));
    const raw = localStorage.getItem(backupKey(workflowId));
    if (raw) {
      try {
        const saved = JSON.parse(raw) as EditorDraft;
        modal.confirm({
          title: 'Unsaved draft found',
          content:
            'A previous unsaved edit was detected. Restore it, or discard it to start from the latest saved content.',
          okText: 'Restore draft',
          cancelText: 'Discard draft',
          onOk: () => {
            setDraft(saved);
            setExpandedKeys(Array.from(collectRefs(saved.steps)));
          },
          onCancel: () => {
            localStorage.removeItem(backupKey(workflowId));
            setDraft(fresh);
            setExpandedKeys(allRefs);
          },
        });
        return;
      } catch {
        localStorage.removeItem(backupKey(workflowId));
      }
    }
    setDraft(fresh);
    setExpandedKeys(allRefs);
    setSelectedRef(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, exported, workflowId]);

  // Reset transient state whenever the editor is fully closed.
  useEffect(() => {
    if (!open) {
      setDraft(null);
      setSelectedRef(null);
      baseline.current = '';
    }
  }, [open]);

  const dirty = useMemo(() => {
    if (!draft) return false;
    return JSON.stringify(serializeDraft(draft)) !== baseline.current;
  }, [draft]);

  // Persist the working draft locally so an accidental close can be recovered.
  useEffect(() => {
    if (!open || !draft) return;
    if (dirty) localStorage.setItem(backupKey(workflowId), JSON.stringify(draft));
  }, [draft, dirty, open, workflowId]);

  const roleIdByName = useMemo(() => {
    const map = new Map<string, number>();
    roles.forEach((r) => map.set(r.name.toLowerCase(), r.id));
    return map;
  }, [roles]);
  const phaseNameById = useMemo(() => {
    const map = new Map<number, string>();
    phases.forEach((p) => map.set(p.id, p.name));
    return map;
  }, [phases]);

  const selectedStep = draft && selectedRef ? findStep(draft.steps, selectedRef) : null;

  /** Applies a mutation to a fresh clone of the draft steps and commits it to state. */
  const mutate = (fn: (steps: ImportStepNode[], d: EditorDraft) => void) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const next: EditorDraft = {
        meta: prev.meta,
        phases: prev.phases,
        steps: structuredClone(prev.steps),
        transitions: prev.transitions.map((t) => ({ ...t })),
      };
      fn(next.steps, next);
      return next;
    });
  };

  const patchStep = (ref: string, patch: Partial<ImportStepNode>) => {
    mutate((steps) => {
      const node = findStep(steps, ref);
      if (node) Object.assign(node, patch);
    });
  };

  const addStep = (parentRef: string | null) => {
    const node: ImportStepNode = { ref: makeTempRef(), name: 'New step' };
    mutate((steps) => {
      if (parentRef == null) {
        steps.push(node);
      } else {
        const parent = findStep(steps, parentRef);
        if (parent) {
          parent.children = parent.children ?? [];
          parent.children.push(node);
        }
      }
    });
    if (parentRef != null) setExpandedKeys((k) => Array.from(new Set([...k, parentRef])));
    setSelectedRef(node.ref);
  };

  const deleteStep = (ref: string) => {
    const node = draft ? findStep(draft.steps, ref) : null;
    const childCount = node?.children?.length ?? 0;
    modal.confirm({
      title: 'Delete step',
      content: childCount
        ? `This also removes the step and its ${childCount} direct child step(s) (and descendants). The change applies only after you click Save.`
        : 'Delete this step? The change applies only after you click Save.',
      okText: 'Delete',
      okButtonProps: { danger: true },
      cancelText: 'Cancel',
      onOk: () => {
        mutate((steps) => {
          removeStep(steps, ref);
        });
        if (selectedRef === ref) setSelectedRef(null);
      },
    });
  };

  const onDrop: TreeProps['onDrop'] = (info) => {
    const dragKey = String(info.dragNode.key);
    const dropKey = String(info.node.key);
    if (dragKey === dropKey || !draft) return;
    if (isDescendant(draft.steps, dragKey, dropKey)) {
      message.warning('Cannot move a step into its own descendant');
      return;
    }
    const dropPos = info.node.pos.split('-');
    const dropPosition = info.dropPosition - Number(dropPos[dropPos.length - 1]);
    mutate((steps) => {
      const dragNode = removeStep(steps, dragKey);
      if (!dragNode) return;
      if (!info.dropToGap) {
        const target = findStep(steps, dropKey);
        if (!target) return;
        target.children = target.children ?? [];
        target.children.push(dragNode);
      } else {
        const spot = locate(steps, dropKey);
        if (!spot) return;
        const insertAt = dropPosition <= -1 ? spot.index : spot.index + 1;
        spot.list.splice(insertAt, 0, dragNode);
      }
    });
    if (!info.dropToGap) setExpandedKeys((k) => Array.from(new Set([...k, dropKey])));
  };

  const saveMutation = useMutation({
    mutationFn: async (opts: { asNewVersion: boolean; copyReviews?: boolean; copyFlags?: boolean }) => {
      const payload = serializeDraft(draft!);
      if (!opts.asNewVersion) {
        await updateWorkflowFromImport(workflowId, payload);
        return { currentId: workflowId, asNewVersion: false };
      }
      // Keep the original version untouched; the new higher-numbered version becomes current.
      const version = await createVersion(workflowId, `Edited · ${new Date().toLocaleString()}`);
      await setCurrentVersion(version.id);
      const versionPayload = structuredClone(payload);
      if (opts.copyReviews) {
        const withReviews = await exportWorkflow(workflowId, true, true);
        attachReviews(versionPayload.steps ?? [], collectReviewsByRef(withReviews.steps));
      }
      await updateWorkflowFromImport(version.id, versionPayload);
      if (opts.copyFlags) {
        await copyFlags(workflowId, version.id);
      }
      return { currentId: version.id, asNewVersion: true };
    },
    onSuccess: (res) => {
      localStorage.removeItem(backupKey(workflowId));
      message.success(
        res.asNewVersion ? 'Saved as a new version; the original is kept' : 'Workflow saved',
      );
      onSaved(res.currentId);
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to save workflow')),
  });

  const requestClose = () => {
    if (dirty) {
      modal.confirm({
        title: 'Discard unsaved changes?',
        content: 'You have unsaved edits. Closing now will lose them.',
        okText: 'Discard & close',
        okButtonProps: { danger: true },
        cancelText: 'Keep editing',
        onOk: () => {
          localStorage.removeItem(backupKey(workflowId));
          onClose();
        },
      });
      return;
    }
    onClose();
  };

  const treeData = useMemo<TreeDataNode[]>(() => {
    if (!draft) return [];
    const toNode = (s: ImportStepNode): TreeDataNode => {
      const phaseId = phaseRefToId(s.phase);
      const phaseName = phaseId != null ? phaseNameById.get(phaseId) : null;
      return {
        key: s.ref,
        title: (
          <Space size={4} style={{ paddingRight: 4 }}>
            <span>{s.name || '(untitled)'}</span>
            {(s.roles ?? []).map((r) => (
              <Tag key={r} color="blue" style={{ marginInlineEnd: 0 }}>
                {r}
              </Tag>
            ))}
            {phaseName && (
              <Tag color="geekblue" style={{ marginInlineEnd: 0 }}>
                {phaseName}
              </Tag>
            )}
          </Space>
        ),
        children: s.children?.length ? s.children.map(toNode) : undefined,
      };
    };
    return draft.steps.map(toNode);
  }, [draft, phaseNameById]);

  return (
    <Modal
      open={open}
      title={null}
      footer={null}
      closable={false}
      maskClosable={false}
      keyboard={false}
      width="100%"
      style={{ top: 0, paddingBottom: 0, maxWidth: '100vw' }}
      styles={{ body: { height: 'calc(100vh - 56px)', padding: 0, overflow: 'hidden' } }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div
          style={{
            padding: '10px 16px',
            background: token.colorWarningBg,
            borderBottom: `2px solid ${token.colorWarningBorder}`,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <WarningOutlined style={{ color: token.colorWarning, fontSize: 18 }} />
          <Typography.Text strong style={{ color: token.colorWarningText, whiteSpace: 'nowrap' }}>
            Edit mode
          </Typography.Text>
          <Typography.Text ellipsis style={{ flex: 1, minWidth: 0 }}>
            Editing: {workflowName}
          </Typography.Text>
          {dirty && <Tag color="warning">Unsaved</Tag>}
          <Dropdown.Button
            type="primary"
            icon={<DownOutlined />}
            loading={saveMutation.isPending}
            disabled={!dirty}
            onClick={() => saveMutation.mutate({ asNewVersion: false })}
            menu={{
              items: [
                {
                  key: 'new-version',
                  icon: <BranchesOutlined />,
                  label: 'Save as new version…',
                  onClick: () => setNewVersionOpen(true),
                },
              ],
            }}
          >
            <SaveOutlined /> Save
          </Dropdown.Button>
          <Button icon={<CloseOutlined />} onClick={requestClose}>
            Close
          </Button>
        </div>

        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <div
            style={{
              width: '55%',
              borderRight: `1px solid ${token.colorBorderSecondary}`,
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
            }}
          >
            <div
              style={{ padding: '8px 12px', borderBottom: `1px solid ${token.colorBorderSecondary}` }}
            >
              <Space>
                <Button icon={<PlusOutlined />} onClick={() => addStep(null)}>
                  Add root step
                </Button>
                <Button
                  icon={<SubnodeOutlined />}
                  disabled={!selectedRef}
                  onClick={() => selectedRef && addStep(selectedRef)}
                >
                  Add sub-step
                </Button>
                <Button
                  danger
                  icon={<DeleteOutlined />}
                  disabled={!selectedRef}
                  onClick={() => selectedRef && deleteStep(selectedRef)}
                >
                  Delete step
                </Button>
              </Space>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
              {isFetching && !draft ? (
                <Empty description="Loading…" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              ) : treeData.length ? (
                <Tree
                  showLine
                  blockNode
                  draggable={{ icon: false }}
                  treeData={treeData}
                  expandedKeys={expandedKeys}
                  selectedKeys={selectedRef ? [selectedRef] : []}
                  onExpand={(k) => setExpandedKeys(k)}
                  onSelect={(k) => setSelectedRef(k.length ? String(k[0]) : null)}
                  onDrop={onDrop}
                />
              ) : (
                <Empty
                  description='No steps yet. Click "Add root step" to begin.'
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                />
              )}
            </div>
            <div
              style={{ padding: '6px 12px', borderTop: `1px solid ${token.colorBorderSecondary}` }}
            >
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Drag a step to reorder; drop it onto another step to make it a child. Changes are
                written only after you click Save.
              </Typography.Text>
            </div>
          </div>

          <div style={{ flex: 1, overflow: 'auto', padding: 16, minWidth: 0 }}>
            {selectedStep ? (
              <StepEditor
                key={selectedStep.ref}
                step={selectedStep}
                roles={roles}
                phases={phases}
                roleIdByName={roleIdByName}
                onChange={(patch) => patchStep(selectedStep.ref, patch)}
              />
            ) : (
              <Empty
                description="Select a step on the left to edit it"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            )}
          </div>
        </div>
      </div>

      <Modal
        open={newVersionOpen}
        title="Save as new version"
        okText="Save as new version"
        confirmLoading={saveMutation.isPending}
        onCancel={() => setNewVersionOpen(false)}
        onOk={() => {
          setNewVersionOpen(false);
          saveMutation.mutate({ asNewVersion: true, copyReviews, copyFlags: copyFlagsOpt });
        }}
      >
        <Typography.Paragraph type="secondary">
          Keeps the current version unchanged and writes your edits into a new, higher-numbered
          version that becomes current.
        </Typography.Paragraph>
        <Space direction="vertical">
          <Checkbox checked={copyReviews} onChange={(e) => setCopyReviews(e.target.checked)}>
            Copy reviews to the new version
          </Checkbox>
          <Checkbox checked={copyFlagsOpt} onChange={(e) => setCopyFlagsOpt(e.target.checked)}>
            Copy personal flags to the new version
          </Checkbox>
        </Space>
      </Modal>
    </Modal>
  );
}

interface StepEditorProps {
  step: ImportStepNode;
  roles: BusinessRole[];
  phases: WorkflowPhase[];
  roleIdByName: Map<string, number>;
  onChange: (patch: Partial<ImportStepNode>) => void;
}

function StepEditor({ step, roles, phases, roleIdByName, onChange }: Readonly<StepEditorProps>) {
  const selectedRoleIds = (step.roles ?? [])
    .map((name) => roleIdByName.get(name.toLowerCase()))
    .filter((id): id is number => id != null);
  const selectedPhaseId = phaseRefToId(step.phase);

  return (
    <Form layout="vertical" requiredMark={false}>
      <Form.Item label="Step name">
        <Input
          value={step.name}
          placeholder="e.g. Map Creation"
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </Form.Item>
      <Form.Item label="Responsible roles">
        <Select
          mode="multiple"
          allowClear
          placeholder="Unassigned"
          value={selectedRoleIds}
          options={roles.map((r) => ({ value: r.id, label: r.name }))}
          onChange={(ids: number[]) => {
            const names = ids
              .map((id) => roles.find((r) => r.id === id)?.name)
              .filter((n): n is string => !!n);
            onChange({ roles: names.length ? names : undefined });
          }}
        />
      </Form.Item>
      <Form.Item label="Phase">
        <Select
          allowClear
          placeholder="Ungrouped"
          value={selectedPhaseId ?? undefined}
          options={phases.map((p) => ({ value: p.id, label: p.name }))}
          onChange={(id: number | undefined) =>
            onChange({ phase: id != null ? phaseIdToRef(id) : undefined })
          }
        />
      </Form.Item>
      <Form.Item label="Description">
        <Input.TextArea
          rows={3}
          value={step.description ?? ''}
          placeholder="What happens in this step"
          onChange={(e) => onChange({ description: e.target.value || undefined })}
        />
      </Form.Item>
      <Form.Item label="Notes / cautions">
        <Input.TextArea
          rows={3}
          value={step.notes ?? ''}
          placeholder="Gotchas, checklist reminders, etc."
          onChange={(e) => onChange({ notes: e.target.value || undefined })}
        />
      </Form.Item>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        The editor adjusts the step backbone (structure and fields) only. Transitions, reviews, and
        personal flags are edited on the browse page.
      </Typography.Text>
    </Form>
  );
}
