import { useMemo, useState } from 'react';
import {
  App as AntApp,
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Progress,
  Row,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
  Tooltip,
  Tree,
  Typography,
} from 'antd';
import type { DataNode } from 'antd/es/tree';
import type { ColumnsType } from 'antd/es/table';
import {
  BarsOutlined,
  CheckCircleTwoTone,
  DeleteOutlined,
  EditOutlined,
  FolderOutlined,
  HomeOutlined,
  MinusCircleOutlined,
  PlusOutlined,
  WarningTwoTone,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  assignChecklistItem,
  createChecklistItem,
  deleteChecklistItem,
  fetchChecklist,
  updateChecklistItem,
  type ArtifactNode,
  type ChecklistFolder,
  type ChecklistItem,
  type ChecklistView,
} from '../../api/artifacts';
import { extractErrorMessage } from '../../api/client';

const OVERALL_KEY = '__overall__';
const ROOT_KEY = '__root__';

type Scope = 'overall' | 'root' | number;

interface ChecklistTabProps {
  artifactId: number;
  nodes: ArtifactNode[];
}

/** Renders the tree title for a folder with a small mandatory-progress badge. */
function folderBadge(folder: ChecklistFolder | undefined) {
  if (!folder || folder.mandatoryTotal + folder.optionalTotal === 0) return null;
  const complete = folder.mandatoryTotal > 0 && folder.mandatorySatisfied === folder.mandatoryTotal;
  if (folder.mandatoryTotal > 0) {
    return (
      <Tag color={complete ? 'success' : 'warning'} style={{ marginLeft: 6 }}>
        {folder.mandatorySatisfied}/{folder.mandatoryTotal}
      </Tag>
    );
  }
  return (
    <Tag color="blue" style={{ marginLeft: 6 }}>
      {folder.optionalSatisfied}/{folder.optionalTotal} optional
    </Tag>
  );
}

export function ChecklistTab({ artifactId, nodes }: Readonly<ChecklistTabProps>) {
  const { message } = AntApp.useApp();
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<Scope>('overall');
  const [editOpen, setEditOpen] = useState(false);
  const [editItem, setEditItem] = useState<ChecklistItem | null>(null);
  const [editFolderId, setEditFolderId] = useState<number | null>(null);
  const [form] = Form.useForm<{ label: string; description?: string; required: boolean }>();

  const { data: checklist, isLoading } = useQuery({
    queryKey: ['artifacts', artifactId, 'checklist'],
    queryFn: () => fetchChecklist(artifactId),
    enabled: Number.isFinite(artifactId),
  });

  const applyView = (view: ChecklistView) => {
    queryClient.setQueryData(['artifacts', artifactId, 'checklist'], view);
    queryClient.invalidateQueries({ queryKey: ['artifacts', artifactId] });
  };

  const createMutation = useMutation({
    mutationFn: (payload: { folderNodeId: number | null; label: string; description?: string | null; required: boolean }) =>
      createChecklistItem(artifactId, payload),
    onSuccess: (view) => {
      applyView(view);
      setEditOpen(false);
      message.success('Checklist item added');
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to add item')),
  });

  const updateMutation = useMutation({
    mutationFn: ({ itemId, payload }: { itemId: number; payload: { label: string; description?: string | null; required: boolean } }) =>
      updateChecklistItem(artifactId, itemId, payload),
    onSuccess: (view) => {
      applyView(view);
      setEditOpen(false);
      message.success('Checklist item saved');
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to save item')),
  });

  const deleteMutation = useMutation({
    mutationFn: (itemId: number) => deleteChecklistItem(artifactId, itemId),
    onSuccess: (view) => {
      applyView(view);
      message.success('Checklist item deleted');
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to delete item')),
  });

  const assignMutation = useMutation({
    mutationFn: ({ itemId, nodeId }: { itemId: number; nodeId: number | null }) =>
      assignChecklistItem(artifactId, itemId, nodeId),
    onSuccess: (view) => {
      applyView(view);
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to update fulfilment')),
  });

  // Direct-child files grouped by their folder id (null = artifact top level).
  const filesByFolder = useMemo(() => {
    const map = new Map<number | null, ArtifactNode[]>();
    const walk = (list: ArtifactNode[]) => {
      for (const n of list) {
        if (n.folder) {
          walk(n.children ?? []);
        } else {
          const key = n.parentId ?? null;
          const arr = map.get(key) ?? [];
          arr.push(n);
          map.set(key, arr);
        }
      }
    };
    walk(nodes);
    return map;
  }, [nodes]);

  const foldersByKey = useMemo(() => {
    const map = new Map<number | null, ChecklistFolder>();
    (checklist?.folders ?? []).forEach((f) => map.set(f.folderNodeId, f));
    return map;
  }, [checklist]);

  const treeData = useMemo<DataNode[]>(() => {
    const toFolderNodes = (list: ArtifactNode[]): DataNode[] =>
      list
        .filter((n) => n.folder)
        .map((n) => ({
          key: n.id,
          icon: <FolderOutlined />,
          title: (
            <span>
              {n.name}
              {folderBadge(foldersByKey.get(n.id))}
            </span>
          ),
          children: toFolderNodes(n.children ?? []),
        }));
    return [
      {
        key: OVERALL_KEY,
        icon: <BarsOutlined />,
        title: (
          <span>
            Overall
            {checklist && checklist.summary.mandatoryTotal > 0 && (
              <Tag
                color={checklist.summary.complete ? 'success' : 'warning'}
                style={{ marginLeft: 6 }}
              >
                {checklist.summary.mandatorySatisfied}/{checklist.summary.mandatoryTotal}
              </Tag>
            )}
          </span>
        ),
      },
      {
        key: ROOT_KEY,
        icon: <HomeOutlined />,
        title: (
          <span>
            (Top level)
            {folderBadge(foldersByKey.get(null))}
          </span>
        ),
      },
      ...toFolderNodes(nodes),
    ];
  }, [nodes, foldersByKey, checklist]);

  const openCreate = (folderNodeId: number | null) => {
    setEditItem(null);
    setEditFolderId(folderNodeId);
    form.setFieldsValue({ label: '', description: '', required: true });
    setEditOpen(true);
  };

  const openEdit = (item: ChecklistItem) => {
    setEditItem(item);
    setEditFolderId(item.folderNodeId);
    form.setFieldsValue({ label: item.label, description: item.description ?? '', required: item.required });
    setEditOpen(true);
  };

  const submit = () => {
    form.validateFields().then((values) => {
      const payload = {
        label: values.label.trim(),
        description: values.description?.trim() ? values.description.trim() : null,
        required: values.required,
      };
      if (editItem) {
        updateMutation.mutate({ itemId: editItem.id, payload });
      } else {
        createMutation.mutate({ folderNodeId: editFolderId, ...payload });
      }
    });
  };

  const columns = (folderNodeId: number | null): ColumnsType<ChecklistItem> => [
    {
      title: '',
      key: 'status',
      width: 36,
      render: (_, r) =>
        r.satisfied ? (
          <CheckCircleTwoTone twoToneColor="#52c41a" />
        ) : r.required ? (
          <WarningTwoTone twoToneColor="#faad14" />
        ) : (
          <MinusCircleOutlined style={{ color: 'rgba(0,0,0,0.25)' }} />
        ),
    },
    {
      title: 'Expected file',
      key: 'label',
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Space size={6}>
            <Typography.Text strong>{r.label}</Typography.Text>
            <Tag color={r.required ? 'red' : 'blue'}>{r.required ? 'Mandatory' : 'Optional'}</Tag>
          </Space>
          {r.description && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {r.description}
            </Typography.Text>
          )}
        </Space>
      ),
    },
    {
      title: 'Fulfilled by',
      key: 'assign',
      width: 260,
      render: (_, r) => {
        const files = filesByFolder.get(folderNodeId) ?? [];
        return (
          <Select
            size="small"
            allowClear
            showSearch
            style={{ width: 240 }}
            placeholder="Select a file in this folder"
            value={r.satisfiedByNodeId ?? undefined}
            optionFilterProp="label"
            options={files.map((f) => ({ label: f.name, value: f.id }))}
            notFoundContent={files.length === 0 ? 'No files in this folder' : undefined}
            onChange={(value) => assignMutation.mutate({ itemId: r.id, nodeId: value ?? null })}
          />
        );
      },
    },
    {
      title: '',
      key: 'actions',
      width: 80,
      render: (_, r) => (
        <Space size={0}>
          <Tooltip title="Edit">
            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          </Tooltip>
          <Popconfirm title="Delete this checklist item?" onConfirm={() => deleteMutation.mutate(r.id)}>
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const renderFolderSection = (folder: ChecklistFolder | undefined, folderNodeId: number | null, title: string, showAdd: boolean) => (
    <Card
      size="small"
      style={{ marginBottom: 12 }}
      title={
        <Space size={6}>
          <span>{title}</span>
          {folder && folder.mandatoryTotal > 0 && (
            <Tag color={folder.mandatorySatisfied === folder.mandatoryTotal ? 'success' : 'warning'}>
              {folder.mandatorySatisfied}/{folder.mandatoryTotal} mandatory
            </Tag>
          )}
          {folder && folder.optionalTotal > 0 && (
            <Tag color="blue">
              {folder.optionalSatisfied}/{folder.optionalTotal} optional
            </Tag>
          )}
        </Space>
      }
      extra={
        showAdd && (
          <Button size="small" icon={<PlusOutlined />} onClick={() => openCreate(folderNodeId)}>
            Add item
          </Button>
        )
      }
    >
      <Table<ChecklistItem>
        size="small"
        rowKey="id"
        pagination={false}
        showHeader={false}
        columns={columns(folderNodeId)}
        dataSource={folder?.items ?? []}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No checklist items" /> }}
      />
    </Card>
  );

  const renderRightPanel = () => {
    if (!checklist) return null;
    if (scope === 'overall') {
      const { summary } = checklist;
      const percent = summary.mandatoryTotal > 0
        ? Math.round((summary.mandatorySatisfied / summary.mandatoryTotal) * 100)
        : 100;
      return (
        <div>
          <Card size="small" style={{ marginBottom: 12 }}>
            <Space direction="vertical" style={{ width: '100%' }} size="small">
              <Space size="large" wrap>
                <Typography.Text strong>Overall progress</Typography.Text>
                <Tag color={summary.complete ? 'success' : 'warning'}>
                  {summary.complete ? 'All mandatory files present' : 'Mandatory files missing'}
                </Tag>
              </Space>
              <Progress
                percent={percent}
                status={summary.complete ? 'success' : 'active'}
                format={() => `${summary.mandatorySatisfied}/${summary.mandatoryTotal} mandatory`}
              />
              <Typography.Text type="secondary">
                Optional: {summary.optionalSatisfied}/{summary.optionalTotal} fulfilled
              </Typography.Text>
            </Space>
          </Card>
          {checklist.folders.length === 0 ? (
            <Empty description="No checklist items defined yet. Select a folder to add some." />
          ) : (
            checklist.folders.map((f) =>
              renderFolderSection(
                f,
                f.folderNodeId,
                f.folderNodeId == null ? '(Top level)' : f.path || f.folderName,
                false,
              ),
            )
          )}
        </div>
      );
    }
    const folderNodeId = scope === 'root' ? null : scope;
    const folder = foldersByKey.get(folderNodeId);
    const title = folderNodeId == null ? '(Top level)' : folder?.path || folder?.folderName || 'Folder';
    return renderFolderSection(folder, folderNodeId, title, true);
  };

  if (isLoading) return <Spin />;

  return (
    <Row gutter={16}>
      <Col xs={24} lg={8}>
        <Card size="small" title="Scope">
          <div style={{ maxHeight: 520, overflow: 'auto' }}>
            <Tree
              showIcon
              blockNode
              defaultExpandAll
              selectedKeys={[scope === 'overall' ? OVERALL_KEY : scope === 'root' ? ROOT_KEY : scope]}
              treeData={treeData}
              onSelect={(keys) => {
                const key = keys[0];
                if (key == null) return;
                if (key === OVERALL_KEY) setScope('overall');
                else if (key === ROOT_KEY) setScope('root');
                else setScope(Number(key));
              }}
            />
          </div>
        </Card>
      </Col>
      <Col xs={24} lg={16}>{renderRightPanel()}</Col>

      <Modal
        open={editOpen}
        title={editItem ? 'Edit checklist item' : 'Add checklist item'}
        okText={editItem ? 'Save' : 'Add'}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
        onCancel={() => setEditOpen(false)}
        onOk={submit}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="label"
            label="Expected file"
            rules={[{ required: true, message: 'Please enter a name' }]}
          >
            <Input maxLength={200} placeholder="e.g. FFID rule file" />
          </Form.Item>
          <Form.Item name="description" label="Note (optional)">
            <Input.TextArea maxLength={400} autoSize={{ minRows: 2, maxRows: 4 }} />
          </Form.Item>
          <Form.Item name="required" label="Requirement" valuePropName="checked">
            <Switch checkedChildren="Mandatory" unCheckedChildren="Optional" />
          </Form.Item>
        </Form>
      </Modal>
    </Row>
  );
}
