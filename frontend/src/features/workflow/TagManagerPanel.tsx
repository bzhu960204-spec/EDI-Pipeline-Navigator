import { App as AntApp, Button, Card, ColorPicker, Form, Input, List, Popconfirm, Tag } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  createTag,
  deleteTag,
  updateTag,
  type WorkflowTag,
  type WorkflowTagPayload,
} from '../../api/workflow';
import { extractErrorMessage } from '../../api/client';

/** Minimal shape of AntD ColorPicker's value that we rely on. */
type ColorLike = { toHexString: () => string };

interface TagManagerPanelProps {
  tags: WorkflowTag[];
  /** When false, the create/edit form is hidden (non-admin, read-only). */
  editable?: boolean;
}

export function TagManagerPanel({ tags, editable = true }: Readonly<TagManagerPanelProps>) {
  const { message } = AntApp.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<{ name: string; color: string }>();
  const [editingId, setEditingId] = useState<number | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['tags'] });
    queryClient.invalidateQueries({ queryKey: ['workflows'] });
  };

  const saveMutation = useMutation({
    mutationFn: (payload: WorkflowTagPayload) =>
      editingId ? updateTag(editingId, payload) : createTag(payload),
    onSuccess: () => {
      message.success(editingId ? 'Tag updated' : 'Tag created');
      form.resetFields();
      setEditingId(null);
      invalidate();
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to save tag')),
  });

  const removeMutation = useMutation({
    mutationFn: (id: number) => deleteTag(id),
    onSuccess: () => {
      message.success('Tag deleted');
      invalidate();
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to delete tag')),
  });

  const startEdit = (tag: WorkflowTag) => {
    setEditingId(tag.id);
    form.setFieldsValue({ name: tag.name, color: tag.color ?? '#1677ff' });
  };

  const normalizeColor = (value: string | ColorLike | undefined): string | undefined => {
    if (!value) return undefined;
    return typeof value === 'string' ? value : value.toHexString();
  };

  return (
    <Card title="Workflow tags" size="small">
      {editable && (
        <Form
          form={form}
          layout="inline"
          initialValues={{ color: '#1677ff' }}
          onFinish={(values) =>
            saveMutation.mutate({ name: values.name, color: normalizeColor(values.color) })
          }
          style={{ marginBottom: 16, rowGap: 8, flexWrap: 'wrap' }}
        >
          <Form.Item name="name" rules={[{ required: true, message: 'Name' }]}>
            <Input placeholder="Tag name" style={{ width: 160 }} />
          </Form.Item>
          <Form.Item name="color" getValueFromEvent={(c) => normalizeColor(c)}>
            <ColorPicker />
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
        dataSource={tags}
        locale={{ emptyText: 'No tags yet' }}
        renderItem={(tag) => (
          <List.Item
            actions={
              editable
                ? [
                    <Button key="edit" type="link" onClick={() => startEdit(tag)}>
                      Edit
                    </Button>,
                    <Popconfirm
                      key="del"
                      title="Delete this tag?"
                      description="It will be removed from any workflows using it."
                      onConfirm={() => removeMutation.mutate(tag.id)}
                    >
                      <Button type="link" danger icon={<DeleteOutlined />} />
                    </Popconfirm>,
                  ]
                : undefined
            }
          >
            <Tag color={tag.color ?? undefined}>{tag.name}</Tag>
          </List.Item>
        )}
      />
    </Card>
  );
}
