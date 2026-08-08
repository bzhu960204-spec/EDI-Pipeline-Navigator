import { useState } from 'react';
import {
  App as AntApp,
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  Upload,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { EditOutlined, DeleteOutlined, PlusOutlined, EditFilled, ImportOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  createWorkflow,
  deleteWorkflow,
  fetchWorkflows,
  importWorkflow,
  updateWorkflow,
  type ImportWorkflowPayload,
  type Workflow,
  type WorkflowPayload,
  type WorkflowStatus,
  type WorkflowType,
} from '../../api/workflow';
import { extractErrorMessage } from '../../api/client';
import { isAdmin, useAuthStore } from '../auth/authStore';

interface FormValues {
  name: string;
  description?: string;
  type: WorkflowType;
  status: WorkflowStatus;
}

function typeColor(type: WorkflowType) {
  return type === 'MASTER' ? 'purple' : 'geekblue';
}

function statusColor(status: WorkflowStatus) {
  return status === 'PUBLISHED' ? 'green' : 'default';
}

export function SubWorkflowsPage() {
  const { message } = AntApp.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const admin = isAdmin(useAuthStore((s) => s.user));
  const [form] = Form.useForm<FormValues>();

  const [editing, setEditing] = useState<Workflow | null | undefined>(undefined);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');

  const { data: workflows = [], isLoading } = useQuery({
    queryKey: ['workflows'],
    queryFn: () => fetchWorkflows(),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['workflows'] });

  const openWorkflow = (wf: Workflow) =>
    navigate(wf.type === 'MASTER' ? `/workflow/compose/${wf.id}` : `/workflow/edit/${wf.id}`);

  const save = useMutation({
    mutationFn: (values: FormValues) => {
      const payload: WorkflowPayload = {
        name: values.name,
        description: values.description,
        type: values.type,
        status: values.status,
      };
      return editing ? updateWorkflow(editing.id, payload) : createWorkflow(payload);
    },
    onSuccess: () => {
      message.success('Workflow saved');
      setEditing(undefined);
      invalidate();
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to save workflow')),
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteWorkflow(id),
    onSuccess: () => {
      message.success('Workflow deleted');
      invalidate();
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to delete workflow')),
  });

  const runImport = useMutation({
    mutationFn: (payload: ImportWorkflowPayload) => importWorkflow(payload),
    onSuccess: (wf) => {
      message.success(`Imported "${wf.name}"`);
      setImportOpen(false);
      setImportText('');
      invalidate();
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to import workflow')),
  });

  const submitImport = () => {
    let payload: ImportWorkflowPayload;
    try {
      payload = JSON.parse(importText) as ImportWorkflowPayload;
    } catch {
      message.error('Invalid JSON');
      return;
    }
    if (!payload || typeof payload.name !== 'string' || !payload.name.trim()) {
      message.error('JSON must include a non-empty "name"');
      return;
    }
    runImport.mutate(payload);
  };

  const onImportFile = (file: File) => {
    file.text().then((text) => setImportText(text));
    return false;
  };

  const openCreate = () => {
    setEditing(null);
    form.setFieldsValue({ name: '', description: '', type: 'SUB', status: 'DRAFT' });
  };

  const openEdit = (wf: Workflow) => {
    setEditing(wf);
    form.setFieldsValue({
      name: wf.name,
      description: wf.description ?? '',
      type: wf.type,
      status: wf.status,
    });
  };

  const columns: ColumnsType<Workflow> = [
    {
      title: 'Name',
      dataIndex: 'name',
      render: (name: string, wf) => (
        <Button type="link" style={{ padding: 0 }} onClick={() => openWorkflow(wf)}>
          {name}
        </Button>
      ),
    },
    {
      title: 'Type',
      dataIndex: 'type',
      width: 110,
      render: (type: WorkflowType) => <Tag color={typeColor(type)}>{type}</Tag>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 120,
      render: (status: WorkflowStatus) => <Tag color={statusColor(status)}>{status}</Tag>,
    },
    { title: 'Steps', dataIndex: 'stepCount', width: 80 },
    {
      title: 'Actions',
      key: 'actions',
      width: 220,
      render: (_, wf) => (
        <Space>
          <Button size="small" icon={<EditFilled />} onClick={() => openWorkflow(wf)}>
            {wf.type === 'MASTER' ? 'Compose' : 'Open editor'}
          </Button>
          {admin && (
            <>
              <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(wf)} />
              <Popconfirm
                title="Delete this workflow?"
                description="All its steps and transitions will be removed."
                onConfirm={() => remove.mutate(wf.id)}
              >
                <Button size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            </>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Sub-Workflows
        </Typography.Title>
        {admin && (
          <Space>
            <Button icon={<ImportOutlined />} onClick={() => setImportOpen(true)}>
              Import JSON
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              New sub-workflow
            </Button>
          </Space>
        )}
      </Row>

      <Table
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={workflows}
        pagination={false}
      />

      <Modal
        open={editing !== undefined}
        title={editing ? 'Edit workflow' : 'New sub-workflow'}
        okText="Save"
        confirmLoading={save.isPending}
        onCancel={() => setEditing(undefined)}
        onOk={() => form.submit()}
      >
        <Form form={form} layout="vertical" onFinish={(values) => save.mutate(values)}>
          <Form.Item name="name" label="Name" rules={[{ required: true, max: 200 }]}>
            <Input placeholder="e.g. JP-MBL Import Parsing" />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={3} maxLength={4000} />
          </Form.Item>
          <Form.Item name="type" label="Type" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'SUB', label: 'Sub-workflow (reusable piece)' },
                { value: 'MASTER', label: 'Master (composition)' },
              ]}
            />
          </Form.Item>
          <Form.Item name="status" label="Status" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'DRAFT', label: 'Draft' },
                { value: 'PUBLISHED', label: 'Published (usable as a piece)' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={importOpen}
        title="Import sub-workflow from JSON"
        okText="Import"
        confirmLoading={runImport.isPending}
        onCancel={() => setImportOpen(false)}
        onOk={submitImport}
        width={640}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Upload accept=".json,application/json" showUploadList={false} beforeUpload={onImportFile}>
            <Button icon={<ImportOutlined />}>Choose JSON file</Button>
          </Upload>
          <Input.TextArea
            rows={14}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder='{ "name": "...", "steps": [ ... ], "transitions": [ ... ] }'
          />
          <Typography.Text type="secondary">
            Missing business roles are created automatically. See the README for the full template.
          </Typography.Text>
        </Space>
      </Modal>
    </div>
  );
}
