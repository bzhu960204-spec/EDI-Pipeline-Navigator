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

/** Flattens a step tree, keyed by lineageKey when present (rename/move proof) else by name-path. */
function flatten(steps: WorkflowStep[], parent = ''): Map<string, FlatStep> {
  const out = new Map<string, FlatStep>();
  steps.forEach((step) => {
    const path = parent ? `${parent} / ${step.name}` : step.name;
    const key = step.lineageKey ?? `name:${path.toLowerCase()}`;
    out.set(key, {
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

type FieldChange = {
  field: string;
  before: string | null;
  after: string | null;
};

type DiffRow = {
  key: string;
  path: string;
  change: 'added' | 'removed' | 'changed';
  fields: FieldChange[];
};

const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  description: 'Description',
  notes: 'Notes',
  roles: 'Roles',
  phase: 'Phase',
};

function diffFields(a: FlatStep, b: FlatStep): FieldChange[] {
  const fields: FieldChange[] = [];
  if (a.name !== b.name) fields.push({ field: 'name', before: a.name, after: b.name });
  if (a.description !== b.description)
    fields.push({ field: 'description', before: a.description, after: b.description });
  if (a.notes !== b.notes) fields.push({ field: 'notes', before: a.notes, after: b.notes });
  if (a.roles !== b.roles) fields.push({ field: 'roles', before: a.roles, after: b.roles });
  if (a.phase !== b.phase) fields.push({ field: 'phase', before: a.phase, after: b.phase });
  return fields;
}

/** All fields of a single step, used to describe an added/removed step in full. */
function snapshotFields(step: FlatStep, kind: 'added' | 'removed'): FieldChange[] {
  const order: (keyof FlatStep)[] = ['name', 'description', 'notes', 'roles', 'phase'];
  return order
    .filter((f) => step[f] !== '')
    .map((f) => ({
      field: f,
      before: kind === 'removed' ? step[f] : null,
      after: kind === 'added' ? step[f] : null,
    }));
}

function buildDiff(a: WorkflowStep[], b: WorkflowStep[]): DiffRow[] {
  const fa = flatten(a);
  const fb = flatten(b);
  const rows: DiffRow[] = [];
  fa.forEach((stepA, key) => {
    const stepB = fb.get(key);
    if (!stepB) {
      rows.push({ key, path: stepA.path, change: 'removed', fields: snapshotFields(stepA, 'removed') });
    } else {
      const fields = diffFields(stepA, stepB);
      // Show a rename as "old -> new" so the moved/renamed step reads clearly.
      const path = stepA.name !== stepB.name ? `${stepA.path} → ${stepB.path}` : stepB.path;
      if (fields.length > 0) rows.push({ key, path, change: 'changed', fields });
    }
  });
  fb.forEach((stepB, key) => {
    if (!fa.has(key)) rows.push({ key, path: stepB.path, change: 'added', fields: snapshotFields(stepB, 'added') });
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
      render: (fields: FieldChange[]) => fields.map((f) => FIELD_LABELS[f.field] ?? f.field).join(', '),
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
        <Table
          rowKey="key"
          size="small"
          columns={columns}
          dataSource={rows}
          pagination={false}
          expandable={{
            rowExpandable: (row) => row.fields.length > 0,
            expandedRowRender: (row) => <FieldChanges fields={row.fields} />,
          }}
        />
      )}
    </Modal>
  );
}

/** Splits a comma-joined role string into a trimmed set. */
function roleSet(value: string | null): Set<string> {
  return new Set(
    (value ?? '')
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean),
  );
}

function RoleDelta({ before, after }: { before: string | null; after: string | null }) {
  const from = roleSet(before);
  const to = roleSet(after);
  const added = [...to].filter((r) => !from.has(r));
  const removed = [...from].filter((r) => !to.has(r));
  if (added.length === 0 && removed.length === 0) {
    return <Typography.Text type="secondary">—</Typography.Text>;
  }
  return (
    <Space size={4} wrap>
      {removed.map((r) => (
        <Tag key={`r-${r}`} color="red">
          − {r}
        </Tag>
      ))}
      {added.map((r) => (
        <Tag key={`a-${r}`} color="green">
          + {r}
        </Tag>
      ))}
    </Space>
  );
}

function ValueCell({ value, tone }: { value: string | null; tone: 'before' | 'after' }) {
  if (value === null || value === '') {
    return <Typography.Text type="secondary">—</Typography.Text>;
  }
  return (
    <Typography.Text
      style={{
        color: tone === 'before' ? '#cf1322' : '#389e0d',
        textDecoration: tone === 'before' ? 'line-through' : undefined,
        whiteSpace: 'pre-wrap',
      }}
    >
      {value}
    </Typography.Text>
  );
}

function FieldChanges({ fields }: { fields: FieldChange[] }) {
  const columns: ColumnsType<FieldChange> = [
    {
      title: 'Field',
      dataIndex: 'field',
      width: 120,
      render: (field: string) => FIELD_LABELS[field] ?? field,
    },
    {
      title: 'Before',
      key: 'before',
      render: (_, f) =>
        f.field === 'roles' ? (
          <RoleDelta before={f.before} after={f.after} />
        ) : (
          <ValueCell value={f.before} tone="before" />
        ),
    },
    {
      title: 'After',
      key: 'after',
      // Role changes are shown as a single +/− delta in the Before column.
      render: (_, f) => (f.field === 'roles' ? null : <ValueCell value={f.after} tone="after" />),
    },
  ];
  return (
    <Table
      rowKey="field"
      size="small"
      columns={columns}
      dataSource={fields}
      pagination={false}
      showHeader={false}
    />
  );
}
