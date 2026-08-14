import { useEffect, useMemo, useState } from 'react';
import {
  App as AntApp,
  Breadcrumb,
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
  Tooltip,
  Tree,
  Typography,
  Upload,
} from 'antd';
import type { DataNode } from 'antd/es/tree';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  CopyOutlined,
  DeleteOutlined,
  DownloadOutlined,
  FileTextOutlined,
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
import { useAuthStore } from '../auth/authStore';

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
  return nodes.map((n) => {
    const name = n.name.trim();
    const purpose = n.description?.trim();
    const title = (
      <Tooltip placement="right" title={purpose || 'No purpose set yet'}>
        <span style={{ color: purpose ? undefined : 'rgba(255,255,255,0.45)' }}>
          {name || <Typography.Text type="danger">(unnamed)</Typography.Text>}
        </span>
      </Tooltip>
    );
    return {
      key: n.key,
      icon: <FolderOutlined />,
      title,
      children: n.children.length ? toTreeData(n.children) : undefined,
    };
  });
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

/** Returns the trail of folder names from the root down to the node with `key`. */
function findPath(nodes: EditNode[], key: string, trail: string[] = []): string[] | null {
  for (const n of nodes) {
    const step = [...trail, n.name.trim() || '(unnamed)'];
    if (n.key === key) return step;
    const found = findPath(n.children, key, step);
    if (found) return found;
  }
  return null;
}

/** Counts named folders that have no purpose description. */
function countMissingPurpose(nodes: EditNode[]): number {
  return nodes.reduce(
    (acc, n) =>
      acc + (n.name.trim() && !n.description?.trim() ? 1 : 0) + countMissingPurpose(n.children),
    0,
  );
}

function treeToMarkdownLines(nodes: EditNode[], depth: number): string[] {
  return nodes.flatMap((n) => {
    const indent = '  '.repeat(depth);
    const name = n.name.trim() || '(unnamed)';
    const purpose = n.description?.trim();
    const suffix = purpose ? ` \u2014 ${purpose}` : '';
    const line = `${indent}- **${name}**${suffix}`;
    return [line, ...treeToMarkdownLines(n.children, depth + 1)];
  });
}

function templateToMarkdown(name: string, description: string, nodes: EditNode[]): string {
  const lines = [`# ${name.trim() || 'Untitled template'}`];
  if (description.trim()) lines.push('', description.trim());
  lines.push('', ...treeToMarkdownLines(nodes, 0));
  return lines.join('\n');
}

function DocNodes({ nodes }: Readonly<{ nodes: EditNode[] }>) {
  return (
    <ul style={{ margin: 0, paddingLeft: 18 }}>
      {nodes.map((n) => {
        const purpose = n.description?.trim();
        return (
          <li key={n.key} style={{ marginBottom: 6 }}>
            <Typography.Text strong>{n.name.trim() || '(unnamed)'}</Typography.Text>
            {purpose ? (
              <Typography.Text type="secondary"> — {purpose}</Typography.Text>
            ) : (
              <Typography.Text type="secondary" italic>
                {' — no purpose'}
              </Typography.Text>
            )}
            {n.children.length > 0 && <DocNodes nodes={n.children} />}
          </li>
        );
      })}
    </ul>
  );
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

interface FolderDetailsProps {
  node: EditNode;
  admin: boolean;
  path: string[] | null;
  onPatch: (patch: Partial<EditNode>) => void;
  onAddSubfolder: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}

function FolderDetails({
  node,
  admin,
  path,
  onPatch,
  onAddSubfolder,
  onMoveUp,
  onMoveDown,
  onDelete,
}: Readonly<FolderDetailsProps>) {
  const purpose = node.description?.trim();

  const renderPurpose = () => {
    if (admin) {
      return (
        <Input.TextArea
          value={node.description ?? ''}
          maxLength={400}
          showCount
          autoSize={{ minRows: 3, maxRows: 10 }}
          placeholder="What this folder is used for"
          style={{ marginBottom: 18 }}
          onChange={(e) => onPatch({ description: e.target.value })}
        />
      );
    }
    if (purpose) {
      return (
        <Typography.Paragraph style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>
          {purpose}
        </Typography.Paragraph>
      );
    }
    return (
      <Typography.Text type="secondary" italic>
        No purpose has been set for this folder.
      </Typography.Text>
    );
  };

  return (
    <Card size="small" title="Folder details">
      <Space direction="vertical" size="small" style={{ width: '100%' }}>
        {path && path.length > 0 && (
          <Breadcrumb style={{ fontSize: 12 }} items={path.map((p) => ({ title: p }))} />
        )}
        <div>
          <Typography.Text type="secondary">Folder name</Typography.Text>
          {admin ? (
            <Input
              value={node.name}
              maxLength={200}
              onChange={(e) => onPatch({ name: e.target.value })}
            />
          ) : (
            <div>
              <Typography.Text strong>{node.name.trim() || '(unnamed)'}</Typography.Text>
            </div>
          )}
        </div>
        <div>
          <Typography.Text type="secondary">Purpose</Typography.Text>
          {renderPurpose()}
        </div>
        {admin && (
          <Space wrap>
            <Button size="small" icon={<FolderAddOutlined />} onClick={onAddSubfolder}>
              Add subfolder
            </Button>
            <Button size="small" icon={<ArrowUpOutlined />} onClick={onMoveUp}>
              Up
            </Button>
            <Button size="small" icon={<ArrowDownOutlined />} onClick={onMoveDown}>
              Down
            </Button>
            <Popconfirm title="Delete this folder and its subfolders?" onConfirm={onDelete}>
              <Button size="small" danger icon={<DeleteOutlined />}>
                Delete
              </Button>
            </Popconfirm>
          </Space>
        )}
      </Space>
    </Card>
  );
}

export function DirectoryTemplatesPage() {
  const { message } = AntApp.useApp();
  const queryClient = useQueryClient();
  const admin = !!useAuthStore((s) => s.user);

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
  const [previewOpen, setPreviewOpen] = useState(false);

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
  const nodePath = selectedNodeKey ? findPath(tree, selectedNodeKey) : null;
  const missingPurposeCount = useMemo(() => countMissingPurpose(tree), [tree]);

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

  const buildMarkdown = () => templateToMarkdown(name, description, tree);

  const copyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(buildMarkdown());
      message.success('Copied as Markdown');
    } catch {
      message.error('Copy failed');
    }
  };

  const downloadMarkdown = () => {
    const blob = new Blob([buildMarkdown()], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${(name || 'template').replace(/[^\w.-]+/g, '_')}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
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
          {(() => {
            if (selectedId == null) {
              return (
                <Card>
                  <Empty description="Select a template to view its directory structure, or create a new one." />
                </Card>
              );
            }
            if (detailLoading && selectedId !== 'new') {
              return (
                <Card>
                  <Spin />
                </Card>
              );
            }
            return (
            <Card
              title={selectedId === 'new' ? 'New template' : 'Edit template'}
              extra={
                <Space>
                  {selectedId !== 'new' && (
                    <Button icon={<FileTextOutlined />} onClick={() => setPreviewOpen(true)}>
                      Preview
                    </Button>
                  )}
                  {admin && typeof selectedId === 'number' && (
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
                  {admin && (
                    <Button
                      type="primary"
                      icon={<SaveOutlined />}
                      loading={save.isPending}
                      onClick={handleSave}
                    >
                      Save
                    </Button>
                  )}
                </Space>
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
                <Space size="small">
                  Folders
                  {missingPurposeCount > 0 && (
                    <Tooltip title="Folders without a purpose description">
                      <Tag color="orange">{missingPurposeCount} missing purpose</Tag>
                    </Tooltip>
                  )}
                </Space>
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
                    <FolderDetails
                      node={selectedNode}
                      admin={admin}
                      path={nodePath}
                      onPatch={(patch) => patchNode(selectedNode.key, patch)}
                      onAddSubfolder={() => handleAddFolder(selectedNode.key)}
                      onMoveUp={() => setTree((p) => moveSibling(p, selectedNode.key, -1))}
                      onMoveDown={() => setTree((p) => moveSibling(p, selectedNode.key, 1))}
                      onDelete={() => handleDeleteNode(selectedNode.key)}
                    />
                  ) : (
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description="Select a folder to edit its name and purpose"
                    />
                  )}
                </Col>
              </Row>
            </Card>
            );
          })()}
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

      <Modal
        open={previewOpen}
        title="Directory documentation"
        width={720}
        onCancel={() => setPreviewOpen(false)}
        footer={[
          <Button key="copy" icon={<CopyOutlined />} onClick={copyMarkdown}>
            Copy as Markdown
          </Button>,
          <Button key="download" icon={<DownloadOutlined />} onClick={downloadMarkdown}>
            Download .md
          </Button>,
          <Button key="close" type="primary" onClick={() => setPreviewOpen(false)}>
            Close
          </Button>,
        ]}
      >
        <div style={{ maxHeight: '60vh', overflow: 'auto' }}>
          <Typography.Title level={5} style={{ marginTop: 0 }}>
            {name.trim() || 'Untitled template'}
          </Typography.Title>
          {description.trim() && (
            <Typography.Paragraph type="secondary">{description.trim()}</Typography.Paragraph>
          )}
          {tree.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No folders defined" />
          ) : (
            <DocNodes nodes={tree} />
          )}
        </div>
      </Modal>
    </div>
  );
}
