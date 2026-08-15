import { useMemo, useState } from 'react';
import { Button, Card, Form, Input, List, Popconfirm, Select, Space, Tag, Tooltip, Typography } from 'antd';
import { DeleteOutlined, FolderAddOutlined, PlusOutlined } from '@ant-design/icons';
import {
  createFolder,
  deleteFolder,
  updateFolder,
  type WorkflowFolder,
  type WorkflowFolderPayload,
} from '../../api/workflow';
import { colorForTag } from './tagColor';
import { useCrudManager } from './useCrudManager';
import {
  MAX_FOLDER_DEPTH,
  buildFolderTree,
  descendantIds,
  flattenFolderTree,
  folderLevel,
  subtreeHeight,
} from './folderTree';

interface FolderManagerPanelProps {
  folders: WorkflowFolder[];
  /** When false, the create/edit form is hidden (non-admin, read-only). */
  editable?: boolean;
}

interface FolderFormValues {
  name: string;
  description?: string;
  parentId?: number | null;
}

export function FolderManagerPanel({ folders, editable = true }: Readonly<FolderManagerPanelProps>) {
  const [addForm] = Form.useForm<FolderFormValues>();
  const [editForm] = Form.useForm<FolderFormValues>();
  // undefined = not adding; null = adding a top-level folder; number = adding a subfolder under that id.
  const [addParentId, setAddParentId] = useState<number | null | undefined>(undefined);

  const { editingId, setEditingId, save: saveMutation, remove: removeMutation } =
    useCrudManager<WorkflowFolderPayload>({
      label: 'Folder',
      create: createFolder,
      update: updateFolder,
      remove: deleteFolder,
      invalidateKeys: [['folders'], ['workflows']],
      onSaved: () => {
        addForm.resetFields();
        editForm.resetFields();
        setAddParentId(undefined);
      },
    });

  const byId = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);
  const flat = useMemo(() => flattenFolderTree(buildFolderTree(folders)), [folders]);
  const parentIds = useMemo(
    () => new Set(folders.map((f) => f.parentId).filter((id): id is number => id != null)),
    [folders],
  );

  // Parent options for the EDIT form only (self, descendants and depth-overflowing targets excluded;
  // the backend enforces the same rules). Creation uses the row-anchored "+ Subfolder" action instead.
  const parentOptions = useMemo(() => {
    const excluded = editingId != null ? descendantIds(editingId, folders) : new Set<number>();
    const height = editingId != null ? subtreeHeight(editingId, folders) : 1;
    const options = flat
      .filter((row) => row.folder.id !== editingId && !excluded.has(row.folder.id))
      .filter((row) => folderLevel(row.folder.id, byId) + height <= MAX_FOLDER_DEPTH)
      .map((row) => ({
        value: row.folder.id,
        label: `${'\u00A0\u00A0'.repeat(row.depth)}${row.folder.name}`,
      }));
    return [{ value: null as number | null, label: 'Top level' }, ...options];
  }, [flat, byId, folders, editingId]);

  const startAdd = (parentId: number | null) => {
    setEditingId(null);
    editForm.resetFields();
    setAddParentId(parentId);
    addForm.resetFields();
  };

  const closeAdd = () => {
    setAddParentId(undefined);
    addForm.resetFields();
  };

  const startEdit = (folder: WorkflowFolder) => {
    setAddParentId(undefined);
    setEditingId(folder.id);
    editForm.setFieldsValue({
      name: folder.name,
      description: folder.description ?? '',
      parentId: folder.parentId ?? null,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    editForm.resetFields();
  };

  const addFormNode = (
    <Form
      form={addForm}
      layout="inline"
      onFinish={(values) =>
        saveMutation.mutate({
          name: values.name,
          description: values.description,
          parentId: addParentId ?? null,
        })
      }
      style={{ rowGap: 8, flexWrap: 'wrap' }}
    >
      <Typography.Text type="secondary" style={{ alignSelf: 'center', marginRight: 4 }}>
        New folder in {addParentId == null ? 'Top level' : byId.get(addParentId)?.name}
      </Typography.Text>
      <Form.Item name="name" rules={[{ required: true, message: 'Name' }]}>
        <Input autoFocus placeholder="Folder name" style={{ width: 160 }} />
      </Form.Item>
      <Form.Item name="description">
        <Input placeholder="Description (optional)" style={{ width: 180 }} />
      </Form.Item>
      <Form.Item>
        <Button type="primary" htmlType="submit" icon={<PlusOutlined />} loading={saveMutation.isPending}>
          Add
        </Button>
      </Form.Item>
      <Form.Item>
        <Button onClick={closeAdd}>Cancel</Button>
      </Form.Item>
    </Form>
  );

  const editFormNode = (
    <Form
      form={editForm}
      layout="inline"
      onFinish={(values) =>
        saveMutation.mutate({
          name: values.name,
          description: values.description,
          parentId: values.parentId ?? null,
        })
      }
      style={{ rowGap: 8, flexWrap: 'wrap' }}
    >
      <Form.Item name="name" rules={[{ required: true, message: 'Name' }]}>
        <Input placeholder="Folder name" style={{ width: 160 }} />
      </Form.Item>
      <Form.Item name="description">
        <Input placeholder="Description (optional)" style={{ width: 180 }} />
      </Form.Item>
      <Form.Item name="parentId">
        <Select allowClear placeholder="Parent folder" style={{ width: 180 }} options={parentOptions} />
      </Form.Item>
      <Form.Item>
        <Button type="primary" htmlType="submit" loading={saveMutation.isPending}>
          Update
        </Button>
      </Form.Item>
      <Form.Item>
        <Button onClick={cancelEdit}>Cancel</Button>
      </Form.Item>
    </Form>
  );

  return (
    <Card title="Workflow folders" size="small">
      {editable && (
        <div style={{ marginBottom: 12 }}>
          {addParentId === null ? (
            addFormNode
          ) : (
            <Button icon={<PlusOutlined />} onClick={() => startAdd(null)}>
              New folder
            </Button>
          )}
        </div>
      )}

      <List
        size="small"
        bordered
        dataSource={flat}
        locale={{ emptyText: 'No folders yet' }}
        renderItem={({ folder, depth }) => {
          const hasChildren = parentIds.has(folder.id);
          const canAddChild = folderLevel(folder.id, byId) < MAX_FOLDER_DEPTH;
          const isEditing = editingId === folder.id;
          const isAddingHere = addParentId === folder.id;
          return (
            <List.Item style={{ display: 'block' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingLeft: depth * 20,
                }}
              >
                <span>
                  <Tag color={colorForTag(folder.name)}>{folder.name}</Tag>
                  {folder.description && (
                    <Typography.Text type="secondary" style={{ marginLeft: 4 }}>
                      {folder.description}
                    </Typography.Text>
                  )}
                </span>
                {editable && (
                  <Space size={0}>
                    {canAddChild && (
                      <Button type="link" icon={<FolderAddOutlined />} onClick={() => startAdd(folder.id)}>
                        Subfolder
                      </Button>
                    )}
                    <Button type="link" onClick={() => startEdit(folder)}>
                      Edit
                    </Button>
                    {hasChildren ? (
                      <Tooltip title="Delete or move the sub-folders first">
                        <Button type="link" danger icon={<DeleteOutlined />} disabled />
                      </Tooltip>
                    ) : (
                      <Popconfirm
                        title="Delete this folder?"
                        description="Workflows inside it are kept and become ungrouped."
                        onConfirm={() => removeMutation.mutate(folder.id)}
                      >
                        <Button type="link" danger icon={<DeleteOutlined />} />
                      </Popconfirm>
                    )}
                  </Space>
                )}
              </div>
              {editable && isEditing && (
                <div style={{ paddingLeft: depth * 20, marginTop: 8 }}>{editFormNode}</div>
              )}
              {editable && isAddingHere && (
                <div style={{ paddingLeft: depth * 20 + 20, marginTop: 8 }}>{addFormNode}</div>
              )}
            </List.Item>
          );
        }}
      />
    </Card>
  );
}
