import { App as AntApp, Button, Card, Empty, Form, Input, Modal, Popconfirm, Row, Space, Table, Tag, Typography } from 'antd';
import { DeleteOutlined, DownloadOutlined, EditOutlined, FolderOpenOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  createArtifact,
  deleteArtifact,
  exportArtifact,
  fetchArtifacts,
  updateArtifact,
  type ArtifactSummary,
} from '../../api/artifacts';
import { fetchTemplates } from '../../api/templates';
import { extractErrorMessage } from '../../api/client';
import { CreateArtifactModal, type CreateArtifactValues } from './CreateArtifactModal';

export function ArtifactsPage() {
  const { message } = AntApp.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editForm] = Form.useForm<{ name: string; ediRef?: string }>();
  const [editId, setEditId] = useState<number | null>(null);

  const { data: artifacts = [], isLoading } = useQuery({
    queryKey: ['artifacts'],
    queryFn: fetchArtifacts,
  });
  const { data: templates = [] } = useQuery({ queryKey: ['templates'], queryFn: fetchTemplates });

  const create = useMutation({
    mutationFn: (values: CreateArtifactValues) => createArtifact(values),
    onSuccess: (artifact) => {
      message.success('Artifact created');
      setCreateOpen(false);
      queryClient.invalidateQueries({ queryKey: ['artifacts'] });
      navigate(`/artifacts/${artifact.id}`);
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to create artifact')),
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteArtifact(id),
    onSuccess: () => {
      message.success('Artifact deleted');
      queryClient.invalidateQueries({ queryKey: ['artifacts'] });
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to delete artifact')),
  });

  const update = useMutation({
    mutationFn: ({ id, values }: { id: number; values: { name: string; ediRef?: string } }) =>
      updateArtifact(id, { name: values.name, ediRef: values.ediRef ?? null }),
    onSuccess: (artifact) => {
      message.success('Artifact updated');
      setEditId(null);
      queryClient.invalidateQueries({ queryKey: ['artifacts'] });
      queryClient.invalidateQueries({ queryKey: ['artifacts', artifact.id] });
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to update artifact')),
  });

  const openEdit = (a: ArtifactSummary) => {
    setEditId(a.id);
    editForm.setFieldsValue({ name: a.name, ediRef: a.ediRef ?? undefined });
  };

  const handleExport = async (a: ArtifactSummary) => {
    try {
      await exportArtifact(a.id, `${a.ediRef || a.name}.zip`);
    } catch (e) {
      message.error(extractErrorMessage(e, 'Export failed'));
    }
  };

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      render: (_: string, a: ArtifactSummary) => (
        <Button type="link" style={{ padding: 0 }} onClick={() => navigate(`/artifacts/${a.id}`)}>
          {a.name}
        </Button>
      ),
    },
    { title: 'EDI Ref', dataIndex: 'ediRef', render: (v: string) => v || '—' },
    {
      title: 'Status',
      dataIndex: 'currentStepName',
      render: (v: string) => (v ? <Tag color="blue">{v}</Tag> : <Tag>Not started</Tag>),
    },
    { title: 'Files', dataIndex: 'fileCount' },
    {
      title: 'Updated',
      dataIndex: 'updatedAt',
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '',
      key: 'actions',
      render: (_: unknown, a: ArtifactSummary) => (
        <Space>
          <Button size="small" icon={<FolderOpenOutlined />} onClick={() => navigate(`/artifacts/${a.id}`)}>
            Open
          </Button>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(a)}>
            Edit
          </Button>
          <Button size="small" icon={<DownloadOutlined />} onClick={() => handleExport(a)}>
            ZIP
          </Button>
          <Popconfirm
            title="Delete this artifact?"
            description="All folders and files are permanently removed."
            onConfirm={() => remove.mutate(a.id)}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Artifact Manager
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          New artifact
        </Button>
      </Row>

      <Card>
        {artifacts.length === 0 && !isLoading ? (
          <Empty description="No artifacts yet. Create one to get started." />
        ) : (
          <Table
            rowKey="id"
            size="middle"
            loading={isLoading}
            dataSource={artifacts}
            columns={columns}
            pagination={false}
          />
        )}
      </Card>

      <CreateArtifactModal
        open={createOpen}
        templates={templates}
        confirmLoading={create.isPending}
        onCancel={() => setCreateOpen(false)}
        onSubmit={(values) => create.mutate(values)}
      />

      <Modal
        open={editId != null}
        title="Edit artifact"
        okText="Save"
        confirmLoading={update.isPending}
        onCancel={() => setEditId(null)}
        onOk={() => editForm.submit()}
        destroyOnClose
      >
        <Form
          form={editForm}
          layout="vertical"
          onFinish={(values) => editId != null && update.mutate({ id: editId, values })}
          requiredMark={false}
        >
          <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Name is required' }]}>
            <Input placeholder="e.g. EDIT0019557 - JP-MBL - Schenker Migration" autoFocus />
          </Form.Item>
          <Form.Item name="ediRef" label="EDI reference">
            <Input placeholder="e.g. EDIT0019557" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
