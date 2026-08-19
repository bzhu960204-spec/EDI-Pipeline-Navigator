import { useState } from 'react';
import { App as AntApp, Button, Empty, Form, Input, Modal, Popconfirm, Space, Table, Typography, Upload } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined, EditOutlined, PlusOutlined, PartitionOutlined, ImportOutlined, InboxOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  createKnowledgeTree,
  deleteKnowledgeTree,
  fetchKnowledgeTrees,
  importKnowledgeTree,
  updateKnowledgeTree,
  type ImportKnowledgeTreePayload,
  type KnowledgeTree,
  type KnowledgeTreePayload,
} from '../../api/knowledge';
import { extractErrorMessage } from '../../api/client';

interface FormValues {
  name: string;
  description?: string;
}

export function KnowledgeTreesPage() {
  const { message } = AntApp.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FormValues>();

  // undefined = modal closed; null = creating; object = editing that tree.
  const [editing, setEditing] = useState<KnowledgeTree | null | undefined>(undefined);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');

  const { data: trees = [], isLoading } = useQuery({
    queryKey: ['knowledge', 'trees'],
    queryFn: fetchKnowledgeTrees,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['knowledge', 'trees'] });

  const createM = useMutation({
    mutationFn: (payload: KnowledgeTreePayload) => createKnowledgeTree(payload),
    onSuccess: (tree) => {
      message.success('Knowledge tree created');
      invalidate();
      setEditing(undefined);
      navigate(`/knowledge/edit/${tree.id}`);
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to create knowledge tree')),
  });

  const updateM = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: KnowledgeTreePayload }) => updateKnowledgeTree(id, payload),
    onSuccess: () => {
      message.success('Knowledge tree updated');
      invalidate();
      setEditing(undefined);
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to update knowledge tree')),
  });

  const deleteM = useMutation({
    mutationFn: (id: number) => deleteKnowledgeTree(id),
    onSuccess: () => {
      message.success('Knowledge tree deleted');
      invalidate();
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to delete knowledge tree')),
  });

  const importM = useMutation({
    mutationFn: (payload: ImportKnowledgeTreePayload) => importKnowledgeTree(payload),
    onSuccess: (tree) => {
      message.success('Knowledge tree imported');
      invalidate();
      setImportOpen(false);
      setImportText('');
      navigate(`/knowledge/edit/${tree.id}`);
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to import knowledge tree')),
  });

  const submitImport = () => {
    let payload: ImportKnowledgeTreePayload;
    try {
      payload = JSON.parse(importText) as ImportKnowledgeTreePayload;
    } catch {
      message.error('Invalid JSON');
      return;
    }
    importM.mutate(payload);
  };

  const onImportFile = (file: File) => {
    file.text().then((text) => setImportText(text));
    return false;
  };

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
  };

  const openEdit = (tree: KnowledgeTree) => {
    setEditing(tree);
    form.setFieldsValue({ name: tree.name, description: tree.description ?? undefined });
  };

  const submit = async () => {
    const values = await form.validateFields();
    const payload: KnowledgeTreePayload = { name: values.name.trim(), description: values.description };
    if (editing) updateM.mutate({ id: editing.id, payload });
    else createM.mutate(payload);
  };

  const columns: ColumnsType<KnowledgeTree> = [
    {
      title: 'Name',
      dataIndex: 'name',
      render: (name: string, tree) => (
        <Button type="link" style={{ padding: 0 }} onClick={() => navigate(`/knowledge/edit/${tree.id}`)}>
          {name}
        </Button>
      ),
    },
    {
      title: 'Description',
      dataIndex: 'description',
      render: (d?: string | null) => (d ? <Typography.Text type="secondary">{d}</Typography.Text> : '—'),
    },
    {
      title: 'Nodes',
      dataIndex: 'nodeCount',
      width: 100,
      align: 'center',
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 160,
      align: 'right',
      render: (_, tree) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(tree)} />
          <Popconfirm
            title="Delete this knowledge tree?"
            description="All of its nodes will be removed."
            onConfirm={() => deleteM.mutate(tree.id)}
            okButtonProps={{ danger: true }}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Space style={{ justifyContent: 'space-between', width: '100%', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          <PartitionOutlined style={{ marginRight: 8 }} />
          Knowledge Trees
        </Typography.Title>
        <Space>
          <Button icon={<ImportOutlined />} onClick={() => setImportOpen(true)}>
            Import
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            New Tree
          </Button>
        </Space>
      </Space>

      <Table
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={trees}
        pagination={false}
        locale={{ emptyText: <Empty description="No knowledge trees yet" /> }}
      />

      <Modal
        open={editing !== undefined}
        title={editing ? 'Edit knowledge tree' : 'New knowledge tree'}
        onCancel={() => setEditing(undefined)}
        onOk={submit}
        confirmLoading={createM.isPending || updateM.isPending}
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Name is required' }]}>
            <Input placeholder="e.g. EDI Development Mastery" maxLength={200} />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={3} maxLength={4000} placeholder="Optional" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={importOpen}
        title="Import knowledge tree"
        okText="Import"
        onCancel={() => setImportOpen(false)}
        onOk={submitImport}
        confirmLoading={importM.isPending}
        destroyOnClose
      >
        <Typography.Paragraph type="secondary">
          Paste an exported knowledge-tree JSON to create a new tree with its full node hierarchy.
        </Typography.Paragraph>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Upload.Dragger accept=".json,application/json" showUploadList={false} beforeUpload={onImportFile}>
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">Drag a JSON file here, or click to browse</p>
          </Upload.Dragger>
          <Input.TextArea
            rows={12}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder='{ "name": "...", "nodes": [ ... ] }'
          />
        </Space>
      </Modal>
    </div>
  );
}
