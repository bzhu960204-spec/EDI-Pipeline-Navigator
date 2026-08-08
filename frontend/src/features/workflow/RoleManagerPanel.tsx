import { App as AntApp, Button, Card, ColorPicker, Form, Input, List, Popconfirm, Space, Tag } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  createRole,
  deleteRole,
  updateRole,
  type BusinessRole,
  type BusinessRolePayload,
} from '../../api/workflow';
import { extractErrorMessage } from '../../api/client';

/** Minimal shape of AntD ColorPicker's value that we rely on. */
type ColorLike = { toHexString: () => string };

interface RoleManagerPanelProps {
  roles: BusinessRole[];
  /** When false, the create/edit form is hidden (non-admin, read-only). */
  editable?: boolean;
}

export function RoleManagerPanel({ roles, editable = true }: Readonly<RoleManagerPanelProps>) {
  const { message } = AntApp.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<{ name: string; color: string; description?: string }>();
  const [editingId, setEditingId] = useState<number | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['workflow'] });
    queryClient.invalidateQueries({ queryKey: ['roles'] });
  };

  const saveMutation = useMutation({
    mutationFn: (payload: BusinessRolePayload) =>
      editingId ? updateRole(editingId, payload) : createRole(payload),
    onSuccess: () => {
      message.success(editingId ? 'Role updated' : 'Role created');
      form.resetFields();
      setEditingId(null);
      invalidate();
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to save role')),
  });

  const removeMutation = useMutation({
    mutationFn: (id: number) => deleteRole(id),
    onSuccess: () => {
      message.success('Role deleted');
      invalidate();
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to delete role')),
  });

  const startEdit = (role: BusinessRole) => {
    setEditingId(role.id);
    form.setFieldsValue({
      name: role.name,
      color: role.color ?? '#1677ff',
      description: role.description ?? '',
    });
  };

  const normalizeColor = (value: string | ColorLike | undefined): string | undefined => {
    if (!value) return undefined;
    return typeof value === 'string' ? value : value.toHexString();
  };

  return (
    <Card title="Business roles" size="small">
      {editable && (
        <Form
          form={form}
          layout="inline"
          initialValues={{ color: '#1677ff' }}
          onFinish={(values) =>
            saveMutation.mutate({
              name: values.name,
              color: normalizeColor(values.color),
              description: values.description,
            })
          }
          style={{ marginBottom: 16, rowGap: 8, flexWrap: 'wrap' }}
        >
          <Form.Item name="name" rules={[{ required: true, message: 'Name' }]}>
            <Input placeholder="Role name" style={{ width: 150 }} />
          </Form.Item>
          <Form.Item name="color" getValueFromEvent={(c) => normalizeColor(c)}>
            <ColorPicker />
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
        dataSource={roles}
        locale={{ emptyText: 'No roles yet' }}
        renderItem={(role) => (
          <List.Item
            actions={
              editable
                ? [
                    <Button key="edit" type="link" onClick={() => startEdit(role)}>
                      Edit
                    </Button>,
                    <Popconfirm
                      key="del"
                      title="Delete this role?"
                      description="Steps using it will become unassigned."
                      onConfirm={() => removeMutation.mutate(role.id)}
                    >
                      <Button type="link" danger icon={<DeleteOutlined />} />
                    </Popconfirm>,
                  ]
                : undefined
            }
          >
            <Space>
              <Tag color={role.color ?? undefined}>{role.name}</Tag>
              <span style={{ color: 'rgba(0,0,0,0.45)' }}>{role.description}</span>
            </Space>
          </List.Item>
        )}
      />
    </Card>
  );
}
