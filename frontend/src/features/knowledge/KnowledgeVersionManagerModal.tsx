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
import {
  BranchesOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  TagOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  createTreeVersion,
  deleteKnowledgeTree,
  exportKnowledgeTree,
  fetchTreeVersions,
  setCurrentTreeVersion,
  updateTreeVersionLabel,
  type KnowledgeTree,
} from '../../api/knowledge';
import { extractErrorMessage } from '../../api/client';
import {
  buildDiff,
  changeColor,
  FIELD_LABELS,
  type DiffRow,
  type FieldChange,
} from './knowledgeVersionDiff';

interface KnowledgeVersionManagerModalProps {
  open: boolean;
  treeId: number;
  onClose: () => void;
}

export function KnowledgeVersionManagerModal({ open, treeId, onClose }: KnowledgeVersionManagerModalProps) {
  const { message } = AntApp.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [selected, setSelected] = useState<number[]>([]);
  const [compareIds, setCompareIds] = useState<[number, number] | null>(null);
  const [labelOpen, setLabelOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [editTarget, setEditTarget] = useState<KnowledgeTree | null>(null);
  const [editLabel, setEditLabel] = useState('');

  const { data: versions = [], isLoading } = useQuery({
    queryKey: ['knowledge', 'versions', treeId],
    queryFn: () => fetchTreeVersions(treeId),
    enabled: open && Number.isFinite(treeId),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['knowledge', 'versions', treeId] });
    queryClient.invalidateQueries({ queryKey: ['knowledge', 'trees'] });
  };

  const makeVersion = useMutation({
    mutationFn: (versionLabel: string) => createTreeVersion(treeId, versionLabel || undefined),
    onSuccess: (tree) => {
      message.success(`Created v${tree.version}`);
      setLabelOpen(false);
      setLabel('');
      invalidate();
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to create version')),
  });

  const promote = useMutation({
    mutationFn: (id: number) => setCurrentTreeVersion(id),
    onSuccess: () => {
      message.success('Current version updated');
      invalidate();
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to set current version')),
  });

  const saveLabel = useMutation({
    mutationFn: (vars: { id: number; value: string }) =>
      updateTreeVersionLabel(vars.id, vars.value || undefined),
    onSuccess: () => {
      message.success('Label updated');
      setEditTarget(null);
      invalidate();
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to update label')),
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteKnowledgeTree(id),
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

  const columns: ColumnsType<KnowledgeTree> = [
    {
      title: '',
      key: 'pick',
      width: 40,
      render: (_, tree) => (
        <Checkbox
          checked={selected.includes(tree.id)}
          onChange={(e) => toggleSelect(tree.id, e.target.checked)}
        />
      ),
    },
    {
      title: 'Version',
      key: 'version',
      render: (_, tree) => (
        <Space>
          <span style={{ fontWeight: 600 }}>v{tree.version}</span>
          {tree.isCurrent && <Tag color="blue">current</Tag>}
          {tree.versionLabel && <Typography.Text type="secondary">{tree.versionLabel}</Typography.Text>}
        </Space>
      ),
    },
    { title: 'Nodes', dataIndex: 'nodeCount', width: 80 },
    {
      title: 'Actions',
      key: 'actions',
      width: 330,
      render: (_, tree) => (
        <Space>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => {
              onClose();
              navigate(`/knowledge/edit/${tree.id}`);
            }}
          >
            Open
          </Button>
          <Button
            size="small"
            icon={<TagOutlined />}
            onClick={() => {
              setEditTarget(tree);
              setEditLabel(tree.versionLabel ?? '');
            }}
          >
            Label
          </Button>
          {!tree.isCurrent && (
            <Button size="small" onClick={() => promote.mutate(tree.id)}>
              Set current
            </Button>
          )}
          {versions.length > 1 && (
            <Popconfirm
              title="Delete this version?"
              description="Its nodes will be permanently removed."
              onConfirm={() => remove.mutate(tree.id)}
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
            <Button icon={<PlusOutlined />} onClick={() => setLabelOpen(true)}>
              New version
            </Button>
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

      <Modal
        open={editTarget !== null}
        title={editTarget ? `Edit label — v${editTarget.version}` : 'Edit label'}
        okText="Save"
        confirmLoading={saveLabel.isPending}
        onCancel={() => setEditTarget(null)}
        onOk={() => editTarget && saveLabel.mutate({ id: editTarget.id, value: editLabel.trim() })}
      >
        <Typography.Paragraph type="secondary">
          Update the label/remark for this version. Leave empty to clear it.
        </Typography.Paragraph>
        <Input
          value={editLabel}
          maxLength={200}
          placeholder="e.g. before Schenker field fix"
          onChange={(e) => setEditLabel(e.target.value)}
          onPressEnter={() =>
            editTarget && saveLabel.mutate({ id: editTarget.id, value: editLabel.trim() })
          }
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
  versions: KnowledgeTree[];
  onClose: () => void;
}) {
  const [idA, idB] = aIds;
  const versionOf = (id: number) => versions.find((v) => v.id === id);
  const { data: treeA, isLoading: la } = useQuery({
    queryKey: ['knowledge', idA, 'export'],
    queryFn: () => exportKnowledgeTree(idA),
  });
  const { data: treeB, isLoading: lb } = useQuery({
    queryKey: ['knowledge', idB, 'export'],
    queryFn: () => exportKnowledgeTree(idB),
  });

  const rows = useMemo(
    () => (treeA && treeB ? buildDiff(treeA, treeB) : []),
    [treeA, treeB],
  );

  const columns: ColumnsType<DiffRow> = [
    {
      title: 'Change',
      dataIndex: 'change',
      width: 110,
      render: (change: DiffRow['change']) => <Tag color={changeColor[change]}>{change}</Tag>,
    },
    { title: 'Node', dataIndex: 'path' },
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
        <Typography.Text type="secondary">No node differences between these two versions.</Typography.Text>
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
      render: (_, f) => <ValueCell value={f.before} tone="before" />,
    },
    {
      title: 'After',
      key: 'after',
      render: (_, f) => <ValueCell value={f.after} tone="after" />,
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
