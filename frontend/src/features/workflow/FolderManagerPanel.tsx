import { App as AntApp, Button, Card, Form, Input, List, Popconfirm, Tag } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  createFolder,
  deleteFolder,
  updateFolder,
  type WorkflowFolder,
  type WorkflowFolderPayload,
} from '../../api/workflow';
import { extractErrorMessage } from '../../api/client';
import { colorForTag } from './tagColor';

interface FolderManagerPanelProps {
  folders: WorkflowFolder[];
  /** When false, the create/edit form is hidden (non-admin, read-only). */
  editable?: boolean;
}

interface FolderFormValues {
  name: string;
  description?: string;
}

export function FolderManagerPanel({ folders, editable = true }: Readonly<FolderManagerPanelProps>) {
  const { message } = AntApp.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FolderFormValues>();
  const [editingId, setEditingId] = useState<number | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['folders'] });
    queryClient.invalidateQueries({ queryKey: ['workflows'] });
  };

  const saveMutation = useMutation({
    mutationFn: (payload: WorkflowFolderPayload) =>
      editingId ? updateFolder(editingId, payload) : createFolder(payload),
    onSuccess: () => {
      message.success(editingId ? 'Folder updated' : 'Folder created');
      form.resetFields();
      setEditingId(null);
      invalidate();
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to save folder')),
  });

  const removeMutation = useMutation({
    mutationFn: (id: number) => deleteFolder(id),
    onSuccess: () => {
      message.success('Folder deleted');
      invalidate();
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to delete folder')),
  });

  const startEdit = (folder: WorkflowFolder) => {
    setEditingId(folder.id);
    form.setFieldsValue({ name: folder.name, description: folder.description ?? '' });
  };

  return (
    <Card title="Workflow folders" size="small">
      {editable && (
        <Form
          form={form}
          layout="inline"
          onFinish={(values) =>
            saveMutation.mutate({ name: values.name, description: values.description })
          }
          style={{ marginBottom: 16, rowGap: 8, flexWrap: 'wrap' }}
        >
          <Form.Item name="name" rules={[{ required: true, message: 'Name' }]}>
            <Input placeholder="Folder name" style={{ width: 160 }} />
          </Form.Item>
          <Form.Item name="description">
            <Input placeholder="Description (optional)" style={{ width: 200 }} />
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
        dataSource={folders}
        locale={{ emptyText: 'No folders yet' }}
        renderItem={(folder) => (
          <List.Item
            actions={
              editable
                ? [
                    <Button key="edit" type="link" onClick={() => startEdit(folder)}>
                      Edit
                    </Button>,
                    <Popconfirm
                      key="del"
                      title="Delete this folder?"
                      description="Workflows inside it are kept and become ungrouped."
                      onConfirm={() => removeMutation.mutate(folder.id)}
                    >
                      <Button type="link" danger icon={<DeleteOutlined />} />
                    </Popconfirm>,
                  ]
                : undefined
            }
          >
            <List.Item.Meta
              title={<Tag color={colorForTag(folder.name)}>{folder.name}</Tag>}
              description={folder.description || undefined}
            />
          </List.Item>
        )}
      />
    </Card>
  );
}
