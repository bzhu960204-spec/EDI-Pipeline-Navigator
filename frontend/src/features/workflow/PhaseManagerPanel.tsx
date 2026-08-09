import { App as AntApp, Button, ColorPicker, Form, Input, InputNumber, List, Popconfirm, Space, Tag } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  createPhase,
  deletePhase,
  updatePhase,
  type WorkflowPhase,
  type WorkflowPhasePayload,
} from '../../api/workflow';
import { extractErrorMessage } from '../../api/client';

type ColorLike = { toHexString: () => string };

interface PhaseManagerPanelProps {
  workflowId: number;
  phases: WorkflowPhase[];
  editable?: boolean;
}

interface PhaseFormValues {
  name: string;
  color: string;
  orderIndex?: number;
  description?: string;
}

export function PhaseManagerPanel({ workflowId, phases, editable = true }: Readonly<PhaseManagerPanelProps>) {
  const { message } = AntApp.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<PhaseFormValues>();
  const [editingId, setEditingId] = useState<number | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['phases', workflowId] });
    queryClient.invalidateQueries({ queryKey: ['workflow', workflowId] });
  };

  const saveMutation = useMutation({
    mutationFn: (payload: WorkflowPhasePayload) =>
      editingId ? updatePhase(editingId, payload) : createPhase(workflowId, payload),
    onSuccess: () => {
      message.success(editingId ? 'Phase updated' : 'Phase created');
      form.resetFields();
      setEditingId(null);
      invalidate();
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to save phase')),
  });

  const removeMutation = useMutation({
    mutationFn: (id: number) => deletePhase(id),
    onSuccess: () => {
      message.success('Phase deleted');
      invalidate();
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to delete phase')),
  });

  const startEdit = (phase: WorkflowPhase) => {
    setEditingId(phase.id);
    form.setFieldsValue({
      name: phase.name,
      color: phase.color ?? '#1677ff',
      orderIndex: phase.orderIndex,
      description: phase.description ?? '',
    });
  };

  const normalizeColor = (value: string | ColorLike | undefined): string | undefined => {
    if (!value) return undefined;
    return typeof value === 'string' ? value : value.toHexString();
  };

  return (
    <div>
      {editable && (
        <Form
          form={form}
          layout="inline"
          initialValues={{ color: '#1677ff' }}
          onFinish={(values) =>
            saveMutation.mutate({
              name: values.name,
              color: normalizeColor(values.color),
              orderIndex: values.orderIndex,
              description: values.description,
            })
          }
          style={{ marginBottom: 16, rowGap: 8, flexWrap: 'wrap' }}
        >
          <Form.Item name="name" rules={[{ required: true, message: 'Name' }]}>
            <Input placeholder="Phase name" style={{ width: 160 }} />
          </Form.Item>
          <Form.Item name="color" getValueFromEvent={(c) => normalizeColor(c)}>
            <ColorPicker />
          </Form.Item>
          <Form.Item name="orderIndex">
            <InputNumber placeholder="Order" style={{ width: 90 }} />
          </Form.Item>
          <Form.Item name="description">
            <Input placeholder="Description" style={{ width: 180 }} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" icon={<PlusOutlined />} loading={saveMutation.isPending}>
              {editingId ? 'Update' : 'Add'}
            </Button>
          </Form.Item>
          {editingId != null && (
            <Form.Item>
              <Button
                onClick={() => {
                  setEditingId(null);
                  form.resetFields();
                }}
              >
                Cancel
              </Button>
            </Form.Item>
          )}
        </Form>
      )}

      <List
        size="small"
        bordered
        dataSource={[...phases].sort((a, b) => a.orderIndex - b.orderIndex)}
        locale={{ emptyText: 'No phases yet' }}
        renderItem={(phase) => (
          <List.Item
            actions={
              editable
                ? [
                    <Button key="edit" type="link" onClick={() => startEdit(phase)}>
                      Edit
                    </Button>,
                    <Popconfirm
                      key="del"
                      title="Delete this phase?"
                      description="Steps in it will become ungrouped."
                      onConfirm={() => removeMutation.mutate(phase.id)}
                    >
                      <Button type="link" danger icon={<DeleteOutlined />} />
                    </Popconfirm>,
                  ]
                : undefined
            }
          >
            <Space>
              <Tag color={phase.color ?? undefined}>{phase.name}</Tag>
              <span style={{ opacity: 0.55, fontSize: 12 }}>#{phase.orderIndex}</span>
              {phase.description && <span style={{ opacity: 0.65 }}>{phase.description}</span>}
            </Space>
          </List.Item>
        )}
      />
    </div>
  );
}
