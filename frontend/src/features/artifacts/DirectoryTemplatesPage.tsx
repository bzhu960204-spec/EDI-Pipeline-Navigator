import { useEffect, useMemo, useState } from 'react';
import {
  App as AntApp,
  Button,
  Card,
  Col,
  Divider,
  Empty,
  Input,
  List,
  Modal,
  Popconfirm,
  Row,
  Space,
  Spin,
  Switch,
  Tag,
  Tree,
  Typography,
  Upload,
} from 'antd';
import type { DataNode } from 'antd/es/tree';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  DownloadOutlined,
  FolderAddOutlined,
  FolderOutlined,
  ImportOutlined,
  InboxOutlined,
  PlusOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createTemplate,
  deleteTemplate,
  exportTemplate,
  fetchTemplate,
  fetchTemplates,
  importTemplate,
  updateTemplate,
  updateTemplateFromImport,
  type TemplateNode,
  type TemplateNodeInput,
  type TemplatePayload,
} from '../../api/templates';
import { extractErrorMessage } from '../../api/client';
import { isAdmin, useAuthStore } from '../auth/authStore';

interface EditNode {
  key: string;
  name: string;
  description?: string;
  children: EditNode[];
}

let keyCounter = 0;
const nextKey = () => `n${++keyCounter}`;

function toEditTree(nodes: TemplateNode[]): EditNode[] {
  return nodes.map((n) => ({
    key: nextKey(),
    name: n.name,
    description: n.description ?? undefined,
    children: toEditTree(n.children ?? []),
  }));
}

function toInput(nodes: EditNode[]): TemplateNodeInput[] {
  return nodes.map((n) => ({
    name: n.name.trim(),
    description: n.description?.trim() ? n.description.trim() : null,
    children: toInput(n.children),
  }));
}

function toTreeData(nodes: EditNode[]): DataNode[] {
  return nodes.map((n) => ({
    key: n.key,
    icon: <FolderOutlined />,
    title: n.name.trim() || <Typography.Text type="danger">(unnamed)</Typography.Text>,
    children: n.children.length ? toTreeData(n.children) : undefined,
  }));
}

function collectKeys(nodes: EditNode[]): string[] {
  return nodes.flatMap((n) => [n.key, ...collectKeys(n.children)]);
}

function findNode(nodes: EditNode[], key: string): EditNode | null {
  for (const n of nodes) {
    if (n.key === key) return n;
    const found = findNode(n.children, key);
    if (found) return found;
  }
  return null;
}

function mapNode(nodes: EditNode[], key: string, fn: (n: EditNode) => EditNode): EditNode[] {
  return nodes.map((n) =>
    n.key === key ? fn(n) : { ...n, children: mapNode(n.children, key, fn) },
  );
}

function removeNode(nodes: EditNode[], key: string): EditNode[] {
  return nodes
    .filter((n) => n.key !== key)
    .map((n) => ({ ...n, children: removeNode(n.children, key) }));
}

function addChild(nodes: EditNode[], parentKey: string | null, child: EditNode): EditNode[] {
  if (parentKey == null) return [...nodes, child];
  return mapNode(nodes, parentKey, (n) => ({ ...n, children: [...n.children, child] }));
}

/** Moves the node with `key` up or down among its siblings. Returns a new tree. */
function moveSibling(nodes: EditNode[], key: string, dir: -1 | 1): EditNode[] {
  const idx = nodes.findIndex((n) => n.key === key);
  if (idx !== -1) {
    const target = idx + dir;
    if (target < 0 || target >= nodes.length) return nodes;
    const copy = [...nodes];
    [copy[idx], copy[target]] = [copy[target], copy[idx]];
    return copy;
  }
  return nodes.map((n) => ({ ...n, children: moveSibling(n.children, key, dir) }));
}

export function DirectoryTemplatesPage() {
  const { message } = AntApp.useApp();
  const queryClient = useQueryClient();
  const admin = isAdmin(useAuthStore((s) => s.user));

  const [selectedId, setSelectedId] = useState<number | 'new' | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [tree, setTree] = useState<EditNode[]>([]);
  const [selectedNodeKey, setSelectedNodeKey] = useState<string | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [updateOpen, setUpdateOpen] = useState(false);
  const [updateText, setUpdateText] = useState('');

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: fetchTemplates,
  });

  const { data: detail, isFetching: detailLoading } = useQuery({
    queryKey: ['templates', selectedId],
    queryFn: () => fetchTemplate(selectedId as number),
    enabled: typeof selectedId === 'number',
  });

  // Load the selected template into the editable draft.
  useEffect(() => {
    if (selectedId === 'new') {
      setName('');
      setDescription('');
      setIsDefault(false);
      setTree([]);
      setSelectedNodeKey(null);
      setExpandedKeys([]);
      return;
    }
    if (detail && detail.id === selectedId) {
      const editTree = toEditTree(detail.nodes);
      setName(detail.name);
      setDescription(detail.description ?? '');
      setIsDefault(detail.isDefault);
      setTree(editTree);
      setSelectedNodeKey(null);
      setExpandedKeys(collectKeys(editTree));
    }
  }, [detail, selectedId]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['templates'] });

  const save = useMutation({
    mutationFn: (payload: TemplatePayload) =>
      selectedId === 'new'
        ? createTemplate(payload)
        : updateTemplate(selectedId as number, payload),
    onSuccess: (saved) => {
      message.success('Template saved');
      invalidate();
      setSelectedId(saved.id);
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to save template')),
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteTemplate(id),
    onSuccess: () => {
      message.success('Template deleted');
      setSelectedId(null);
      invalidate();
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to delete template')),
  });

  const runImport = useMutation({
    mutationFn: (payload: TemplatePayload) => importTemplate(payload),
    onSuccess: (saved) => {
      message.success(`Imported "${saved.name}"`);
      setImportOpen(false);
      setImportText('');
      invalidate();
      setSelectedId(saved.id);
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to import template')),
  });

  const runExport = useMutation({
    mutationFn: (id: number) => exportTemplate(id),
    onSuccess: (payload) => {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${(payload.name || 'template').replace(/[^\w.-]+/g, '_')}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      message.success('Template exported');
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to export template')),
  });

  const runUpdate = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: TemplatePayload }) =>
      updateTemplateFromImport(id, payload),
    onSuccess: (saved) => {
      message.success(`Updated "${saved.name}"`);
      setUpdateOpen(false);
      setUpdateText('');
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['templates', saved.id] });
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to update template')),
  });

  const parsePayload = (text: string): TemplatePayload | null => {
    let payload: TemplatePayload;
    try {
      payload = JSON.parse(text) as TemplatePayload;
    } catch {
      message.error('Invalid JSON');
      return null;
    }
    if (!payload || typeof payload.name !== 'string' || !payload.name.trim()) {
      message.error('JSON must include a non-empty "name"');
      return null;
    }
    return payload;
  };

  const submitImport = () => {
    const payload = parsePayload(importText);
    if (payload) runImport.mutate(payload);
  };

  const submitUpdate = () => {
    if (typeof selectedId !== 'number') return;
    const payload = parsePayload(updateText);
    if (payload) runUpdate.mutate({ id: selectedId, payload });
  };

  const treeData = useMemo(() => toTreeData(tree), [tree]);
  const selectedNode = selectedNodeKey ? findNode(tree, selectedNodeKey) : null;

  const patchNode = (key: string, patch: Partial<EditNode>) =>
    setTree((prev) => mapNode(prev, key, (n) => ({ ...n, ...patch })));

  const handleAddFolder = (parentKey: string | null) => {
    const node: EditNode = { key: nextKey(), name: 'New folder', description: undefined, children: [] };
    setTree((prev) => addChild(prev, parentKey, node));
    if (parentKey) setExpandedKeys((k) => Array.from(new Set([...k, parentKey])));
    setSelectedNodeKey(node.key);
  };

  const handleDeleteNode = (key: string) => {
    setTree((prev) => removeNode(prev, key));
    if (selectedNodeKey === key) setSelectedNodeKey(null);
  };

  const handleSave = () => {
    if (!name.trim()) {
      message.error('Template name is required');
      return;
    }
    if (collectKeys(tree).some((k) => !findNode(tree, k)!.name.trim())) {
      message.error('Every folder must have a name');
      return;
    }
    save.mutate({
      name: name.trim(),
      description: description.trim() ? description.trim() : null,
      isDefault,
      nodes: toInput(tree),
    });
  };

  return (
    <div>
      <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 16 }}>
        Directory Templates
      </Typography.Title>
      <Row gutter={16}>
        <Col xs={24} lg={8}>
          <Card
            size="small"
            title="Templates"
            extra={
              admin && (
                <Space size="small">
                  <Button
                    size="small"
                    icon={<ImportOutlined />}
                    onClick={() => {
                      setImportText('');
                      setImportOpen(true);
                    }}
                  >
                    Import
                  </Button>
                  <Button
                    size="small"
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => setSelectedId('new')}
                  >
                    New
                  </Button>
                </Space>
              )
            }
          >
            <List
              size="small"
              loading={isLoading}
              dataSource={templates}
              locale={{ emptyText: 'No templates yet' }}
              renderItem={(t) => (
                <List.Item
                  style={{ cursor: 'pointer', background: t.id === selectedId ? 'rgba(22,119,255,0.08)' : undefined }}
                  onClick={() => setSelectedId(t.id)}
                >
                  <List.Item.Meta
                    title={
                      <Space>
                        {t.name}
                        {t.isDefault && <Tag color="gold">default</Tag>}
                      </Space>
                    }
                    description={t.description || undefined}
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>

        <Col xs={24} lg={16}>
          {selectedId == null ? (
            <Card>
              <Empty description="Select a template to view its directory structure, or create a new one." />
            </Card>
          ) : detailLoading && selectedId !== 'new' ? (
            <Card>
              <Spin />
            </Card>
          ) : (
            <Card
              title={selectedId === 'new' ? 'New template' : 'Edit template'}
              extra={
                admin && (
                  <Space>
                    {typeof selectedId === 'number' && (
                      <>
                        <Button
                          icon={<DownloadOutlined />}
                          loading={runExport.isPending}
                          onClick={() => runExport.mutate(selectedId)}
                        >
                          Export
                        </Button>
                        <Button
                          icon={<ImportOutlined />}
                          onClick={() => {
                            setUpdateText('');
                            setUpdateOpen(true);
                          }}
                        >
                          Update from JSON
                        </Button>
                        <Popconfirm
                          title="Delete this template?"
                          description="Artifacts already created keep their folders."
                          onConfirm={() => remove.mutate(selectedId)}
                        >
                          <Button danger icon={<DeleteOutlined />}>
                            Delete
                          </Button>
                        </Popconfirm>
                      </>
                    )}
                    <Button
                      type="primary"
                      icon={<SaveOutlined />}
                      loading={save.isPending}
                      onClick={handleSave}
                    >
                      Save
                    </Button>
                  </Space>
                )
              }
            >
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                <div>
                  <Typography.Text type="secondary">Name</Typography.Text>
                  <Input
                    value={name}
                    disabled={!admin}
                    maxLength={120}
                    placeholder="Template name"
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div>
                  <Typography.Text type="secondary">Description</Typography.Text>
                  <Input.TextArea
                    value={description}
                    disabled={!admin}
                    maxLength={400}
                    autoSize={{ minRows: 1, maxRows: 3 }}
                    placeholder="What this template is for"
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
                <Space>
                  <Switch checked={isDefault} disabled={!admin} onChange={setIsDefault} />
                  <Typography.Text>Use as default when creating artifacts</Typography.Text>
                </Space>
              </Space>

              <Divider orientation="left" style={{ marginTop: 20 }}>
                Folders
              </Divider>

              <Row gutter={16}>
                <Col xs={24} md={13}>
                  {admin && (
                    <Button
                      size="small"
                      icon={<FolderAddOutlined />}
                      style={{ marginBottom: 8 }}
                      onClick={() => handleAddFolder(null)}
                    >
                      Add root folder
                    </Button>
                  )}
                  {tree.length === 0 ? (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No folders defined" />
                  ) : (
                    <Tree
                      showIcon
                      blockNode
                      selectedKeys={selectedNodeKey ? [selectedNodeKey] : []}
                      expandedKeys={expandedKeys}
                      onExpand={(keys) => setExpandedKeys(keys as string[])}
                      treeData={treeData}
                      onSelect={(keys) => setSelectedNodeKey((keys[0] as string) ?? null)}
                    />
                  )}
                </Col>

                <Col xs={24} md={11}>
                  {selectedNode ? (
                    <Card size="small" title="Folder details">
                      <Space direction="vertical" size="small" style={{ width: '100%' }}>
                        <div>
                          <Typography.Text type="secondary">Folder name</Typography.Text>
                          <Input
                            value={selectedNode.name}
                            disabled={!admin}
                            maxLength={200}
                            onChange={(e) => patchNode(selectedNode.key, { name: e.target.value })}
                          />
                        </div>
                        <div>
                          <Typography.Text type="secondary">Purpose</Typography.Text>
                          <Input.TextArea
                            value={selectedNode.description ?? ''}
                            disabled={!admin}
                            maxLength={400}
                            autoSize={{ minRows: 2, maxRows: 4 }}
                            placeholder="What this folder is used for"
                            onChange={(e) =>
                              patchNode(selectedNode.key, { description: e.target.value })
                            }
                          />
                        </div>
                        {admin && (
                          <Space wrap>
                            <Button
                              size="small"
                              icon={<FolderAddOutlined />}
                              onClick={() => handleAddFolder(selectedNode.key)}
                            >
                              Add subfolder
                            </Button>
                            <Button
                              size="small"
                              icon={<ArrowUpOutlined />}
                              onClick={() => setTree((p) => moveSibling(p, selectedNode.key, -1))}
                            >
                              Up
                            </Button>
                            <Button
                              size="small"
                              icon={<ArrowDownOutlined />}
                              onClick={() => setTree((p) => moveSibling(p, selectedNode.key, 1))}
                            >
                              Down
                            </Button>
                            <Popconfirm
                              title="Delete this folder and its subfolders?"
                              onConfirm={() => handleDeleteNode(selectedNode.key)}
                            >
                              <Button size="small" danger icon={<DeleteOutlined />}>
                                Delete
                              </Button>
                            </Popconfirm>
                          </Space>
                        )}
                      </Space>
                    </Card>
                  ) : (
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description="Select a folder to edit its name and purpose"
                    />
                  )}
                </Col>
              </Row>
            </Card>
          )}
        </Col>
      </Row>

      <Modal
        open={importOpen}
        title="Import template from JSON"
        okText="Import"
        confirmLoading={runImport.isPending}
        onCancel={() => setImportOpen(false)}
        onOk={submitImport}
        width={640}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Upload.Dragger
            accept=".json,application/json"
            showUploadList={false}
            beforeUpload={(file) => {
              file.text().then((text) => setImportText(text));
              return false;
            }}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">Drag a JSON file here, or click to browse</p>
          </Upload.Dragger>
          <Input.TextArea
            rows={14}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder='{ "name": "...", "nodes": [ ... ] }'
          />
          <Typography.Text type="secondary">
            A new template is created; it is never set as default on import. See the README for the full schema.
          </Typography.Text>
        </Space>
      </Modal>

      <Modal
        open={updateOpen}
        title="Update template from JSON"
        okText="Update"
        confirmLoading={runUpdate.isPending}
        onCancel={() => setUpdateOpen(false)}
        onOk={submitUpdate}
        width={640}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Upload.Dragger
            accept=".json,application/json"
            showUploadList={false}
            beforeUpload={(file) => {
              file.text().then((text) => setUpdateText(text));
              return false;
            }}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">Drag a JSON file here, or click to browse</p>
          </Upload.Dragger>
          <Input.TextArea
            rows={14}
            value={updateText}
            onChange={(e) => setUpdateText(e.target.value)}
            placeholder='{ "name": "...", "nodes": [ ... ] }'
          />
          <Typography.Text type="secondary">
            Replaces this template's name, description and entire folder tree.
          </Typography.Text>
        </Space>
      </Modal>
    </div>
  );
}
