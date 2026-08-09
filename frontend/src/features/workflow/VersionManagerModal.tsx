import { useMemo, useState } from 'react';
import {
  App as AntApp,
  Button,
  Checkbox,
  Input,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { BranchesOutlined, DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  createVersion,
  deleteWorkflow,
  fetchVersions,
  fetchWorkflowTree,
  setCurrentVersion,
  type Workflow,
  type WorkflowStep,
} from '../../api/workflow';
import { extractErrorMessage } from '../../api/client';

interface VersionManagerModalProps {
  open: boolean;
  workflowId: number;
  admin: boolean;
  onClose: () => void;
}

interface FlatStep {
  path: string;
  name: string;
  description: string;
  notes: string;
  roles: string;
  phase: string;
}

/** Flattens a step tree into a map keyed by name-path, so two versions can be aligned for a diff. */
function flatten(steps: WorkflowStep[], parent = ''): Map<string, FlatStep> {
  const out = new Map<string, FlatStep>();
  steps.forEach((step) => {
    const path = parent ? `${parent} / ${step.name}` : step.name;
    out.set(path.toLowerCase(), {
      path,
      name: step.name,
      description: step.description ?? '',
      notes: step.notes ?? '',
      roles: step.businessRoles.map((r) => r.name).sort().join(', '),
      phase: step.phase?.name ?? '',
    });
    if (step.children?.length) {
      flatten(step.children, path).forEach((v, k) => out.set(k, v));
    }
  });
  return out;
}

type DiffRow = {
  key: string;
  path: string;
  change: 'added' | 'removed' | 'changed';
  fields: string[];
};

function diffFields(a: FlatStep, b: FlatStep): string[] {
  const fields: string[] = [];
  if (a.description !== b.description) fields.push('description');
  if (a.notes !== b.notes) fields.push('notes');
  if (a.roles !== b.roles) fields.push('roles');
  if (a.phase !== b.phase) fields.push('phase');
  return fields;
}

function buildDiff(a: WorkflowStep[], b: WorkflowStep[]): DiffRow[] {
  const fa = flatten(a);
  const fb = flatten(b);
  const rows: DiffRow[] = [];
  fa.forEach((stepA, key) => {
    const stepB = fb.get(key);
    if (!stepB) {
      rows.push({ key, path: stepA.path, change: 'removed', fields: [] });
    } else {
      const fields = diffFields(stepA, stepB);
      if (fields.length > 0) rows.push({ key, path: stepA.path, change: 'changed', fields });
    }
  });
  fb.forEach((stepB, key) => {
    if (!fa.has(key)) rows.push({ key, path: stepB.path, change: 'added', fields: [] });
  });
  return rows.sort((x, y) => x.path.localeCompare(y.path));
}

const changeColor: Record<DiffRow['change'], string> = {
  added: 'green',
  removed: 'red',
  changed: 'gold',
};

export function VersionManagerModal({ open, workflowId, admin, onClose }: VersionManagerModalProps) {
  const { message } = AntApp.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [selected, setSelected] = useState<number[]>([]);
  const [compareIds, setCompareIds] = useState<[number, number] | null>(null);
  const [labelOpen, setLabelOpen] = useState(false);
  const [label, setLabel] = useState('');

  const { data: versions = [], isLoading } = useQuery({
    queryKey: ['versions', workflowId],
    queryFn: () => fetchVersions(workflowId),
    enabled: open && Number.isFinite(workflowId),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['versions', workflowId] });
    queryClient.invalidateQueries({ queryKey: ['workflows'] });
  };

  const makeVersion = useMutation({
    mutationFn: (versionLabel: string) => createVersion(workflowId, versionLabel || undefined),
    onSuccess: (wf) => {
      message.success(`Created v${wf.version}`);
      setLabelOpen(false);
      setLabel('');
      invalidate();
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to create version')),
  });

  const promote = useMutation({
    mutationFn: (id: number) => setCurrentVersion(id),
    onSuccess: () => {
      message.success('Current version updated');
      invalidate();
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to set current version')),
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteWorkflow(id),
    onSuccess: () => {
      message.success('Version deleted');
      setSelected((ids) => ids.filter((x) => x));
      invalidate();
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to delete version')),
  });

  const toggleSelect = (id: number, checked: boolean) => {
    setSelected((ids) => {
      if (checked) return [...ids, id].slice(-2);
      return ids.filter((x) => x !== id);
    });
  };

  const columns: ColumnsType<Workflow> = [
    {
      title: '',
      key: 'pick',
      width: 40,
      render: (_, wf) => (
        <Checkbox
          checked={selected.includes(wf.id)}
          onChange={(e) => toggleSelect(wf.id, e.target.checked)}
        />
      ),
    },
    {
      title: 'Version',
      key: 'version',
      render: (_, wf) => (
        <Space>
          <span style={{ fontWeight: 600 }}>v{wf.version}</span>
          {wf.isCurrent && <Tag color="blue">current</Tag>}
          {wf.versionLabel && <Typography.Text type="secondary">{wf.versionLabel}</Typography.Text>}
        </Space>
      ),
    },
    { title: 'Steps', dataIndex: 'stepCount', width: 80 },
    {
      title: 'Actions',
      key: 'actions',
      width: 260,
      render: (_, wf) => (
        <Space>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => {
              onClose();
              navigate(`/workflow/edit/${wf.id}`);
            }}
          >
            Open
          </Button>
          {admin && !wf.isCurrent && (
            <Button size="small" onClick={() => promote.mutate(wf.id)}>
              Set current
            </Button>
          )}
          {admin && versions.length > 1 && (
            <Popconfirm
              title="Delete this version?"
              description="Its steps and transitions will be removed. Artifacts pinned to it block deletion."
              onConfirm={() => remove.mutate(wf.id)}
            >
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const startCompare = () => {
    if (selected.length === 2) {
      setCompareIds([selected[0], selected[1]]);
    }
  };

  return (
    <>
      <Modal open={open} title="Versions" footer={null} width={760} onCancel={onClose}>
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Space>
            {admin && (
              <Button icon={<PlusOutlined />} onClick={() => setLabelOpen(true)}>
                New version
              </Button>
            )}
            <Button icon={<BranchesOutlined />} disabled={selected.length !== 2} onClick={startCompare}>
              Compare selected
            </Button>
            <Typography.Text type="secondary">
              A new version is an editable copy; older versions stay untouched.
            </Typography.Text>
          </Space>
          <Table
            rowKey="id"
            size="small"
            loading={isLoading}
            columns={columns}
            dataSource={versions}
            pagination={false}
          />
        </Space>
      </Modal>

      <Modal
        open={labelOpen}
        title="New version"
        okText="Create"
        confirmLoading={makeVersion.isPending}
        onCancel={() => setLabelOpen(false)}
        onOk={() => makeVersion.mutate(label.trim())}
      >
        <Typography.Paragraph type="secondary">
          Copies the current content into a new editable version. Optionally label it.
        </Typography.Paragraph>
        <Input
          value={label}
          maxLength={200}
          placeholder="e.g. before Schenker field fix"
          onChange={(e) => setLabel(e.target.value)}
        />
      </Modal>

      {compareIds && (
        <CompareDrawer aIds={compareIds} versions={versions} onClose={() => setCompareIds(null)} />
      )}
    </>
  );
}

function CompareDrawer({
  aIds,
  versions,
  onClose,
}: {
  aIds: [number, number];
  versions: Workflow[];
  onClose: () => void;
}) {
  const [idA, idB] = aIds;
  const versionOf = (id: number) => versions.find((v) => v.id === id);
  const { data: treeA = [], isLoading: la } = useQuery({
    queryKey: ['workflow', idA, 'tree'],
    queryFn: () => fetchWorkflowTree(idA),
  });
  const { data: treeB = [], isLoading: lb } = useQuery({
    queryKey: ['workflow', idB, 'tree'],
    queryFn: () => fetchWorkflowTree(idB),
  });

  const rows = useMemo(() => buildDiff(treeA, treeB), [treeA, treeB]);

  const columns: ColumnsType<DiffRow> = [
    {
      title: 'Change',
      dataIndex: 'change',
      width: 110,
      render: (change: DiffRow['change']) => <Tag color={changeColor[change]}>{change}</Tag>,
    },
    { title: 'Step', dataIndex: 'path' },
    {
      title: 'Fields',
      dataIndex: 'fields',
      render: (fields: string[]) => fields.join(', '),
    },
  ];

  return (
    <Modal
      open
      title={`Compare v${versionOf(idA)?.version} → v${versionOf(idB)?.version}`}
      footer={null}
      width={760}
      onCancel={onClose}
    >
      {la || lb ? (
        <Typography.Text type="secondary">Loading…</Typography.Text>
      ) : rows.length === 0 ? (
        <Typography.Text type="secondary">No step differences between these two versions.</Typography.Text>
      ) : (
        <Table rowKey="key" size="small" columns={columns} dataSource={rows} pagination={false} />
      )}
    </Modal>
  );
}
