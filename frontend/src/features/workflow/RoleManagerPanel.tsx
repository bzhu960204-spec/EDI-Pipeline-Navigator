import { Button, Card, ColorPicker, Form, Input, List, Popconfirm, Space, Tag } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import {
  createRole,
  deleteRole,
  updateRole,
  type BusinessRole,
  type BusinessRolePayload,
} from '../../api/workflow';
import { normalizeColor, useCrudManager } from './useCrudManager';

interface RoleManagerPanelProps {
  roles: BusinessRole[];
  /** When false, the create/edit form is hidden (non-admin, read-only). */
  editable?: boolean;
}

export function RoleManagerPanel({ roles, editable = true }: Readonly<RoleManagerPanelProps>) {
  const [form] = Form.useForm<{ name: string; color: string; description?: string }>();
  const { editingId, setEditingId, save: saveMutation, remove: removeMutation } =
    useCrudManager<BusinessRolePayload>({
      label: 'Role',
      create: createRole,
      update: updateRole,
      remove: deleteRole,
      invalidateKeys: [['workflow'], ['roles']],
      onSaved: () => form.resetFields(),
    });

  const startEdit = (role: BusinessRole) => {
    setEditingId(role.id);
    form.setFieldsValue({
      name: role.name,
      color: role.color ?? '#1677ff',
      description: role.description ?? '',
    });
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
