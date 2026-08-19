import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  App as AntApp,
  Breadcrumb,
  Button,
  Card,
  Col,
  Descriptions,
  Dropdown,
  Empty,
  Form,
  Input,
  Modal,
  Row,
  Space,
  Spin,
  Tag,
  Typography,
  Upload,
} from 'antd';
import type { DataNode } from 'antd/es/tree';
import type { MenuProps } from 'antd';
import { Tree } from 'antd';
import {
  ArrowLeftOutlined,
  BranchesOutlined,
  CheckOutlined,
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
  ExportOutlined,
  HomeOutlined,
  ImportOutlined,
  InboxOutlined,
  MoreOutlined,
  PlusOutlined,
  StarOutlined,
  AimOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import {
  createKnowledgeNode,
  deleteKnowledgeNode,
  exportKnowledgeTree,
  fetchKnowledgeNode,
  fetchKnowledgeTree,
  fetchNodeAncestors,
  fetchNodeChildren,
  fetchTreeVersions,
  moveKnowledgeNode,
  setCurrentTreeVersion,
  updateKnowledgeNode,
  updateKnowledgeTreeFromImport,
  type ImportKnowledgeTreePayload,
  type KnowledgeNode,
} from '../../api/knowledge';
import { extractErrorMessage } from '../../api/client';
import { KnowledgeVersionManagerModal } from './KnowledgeVersionManagerModal';

type NodeMap = Record<number, KnowledgeNode>;

function buildDataNode(node: KnowledgeNode): DataNode {
  return {
    key: node.id,
    isLeaf: node.childCount === 0,
    title: (
      <Space size={6}>
        <span>{node.name}</span>
        {node.childCount > 0 && (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {node.childCount}
          </Typography.Text>
        )}
      </Space>
    ),
  };
}

/** Replace the children of the node identified by {@code key}, leaving the rest of the tree intact. */
function setChildrenAt(data: DataNode[], key: number, children: DataNode[]): DataNode[] {
  return data.map((node) => {
    if (node.key === key) {
      return { ...node, children, isLeaf: children.length === 0 };
    }
    if (node.children) {
      return { ...node, children: setChildrenAt(node.children, key, children) };
    }
    return node;
  });
}

/** Keys of nodes whose children are materialized in the tree; drives Ant's controlled loadedKeys. */
function collectLoadedKeys(data: DataNode[], acc: number[] = []): number[] {
  data.forEach((node) => {
    if (node.children) {
      acc.push(Number(node.key));
      collectLoadedKeys(node.children, acc);
    }
  });
  return acc;
}

interface NodeFormValues {
  name: string;
  description?: string;
  notes?: string;
}

export function KnowledgeTreePage() {
  const { id } = useParams<{ id: string }>();
  const treeId = Number(id);
  const { message, modal } = AntApp.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<NodeFormValues>();

  const [focusId, setFocusId] = useState<number | null>(null);
  const [treeData, setTreeData] = useState<DataNode[]>([]);
  const [nodesById, setNodesById] = useState<NodeMap>({});
  const [expandedKeys, setExpandedKeys] = useState<number[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // Bumped after an update-from-JSON to force the tree to re-seed from the server.
  const [reseedNonce, setReseedNonce] = useState(0);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [updateText, setUpdateText] = useState('');
  const [versionsOpen, setVersionsOpen] = useState(false);
  // { mode: 'create', parentId } to add a child, or { mode: 'edit', node } to rename/edit.
  const [nodeModal, setNodeModal] = useState<
    { mode: 'create'; parentId: number } | { mode: 'edit'; node: KnowledgeNode } | null
  >(null);

  const { data: tree, isLoading: treeLoading } = useQuery({
    queryKey: ['knowledge', 'tree', treeId],
    queryFn: () => fetchKnowledgeTree(treeId),
    enabled: Number.isFinite(treeId),
  });

  const { data: versions = [] } = useQuery({
    queryKey: ['knowledge', 'versions', treeId],
    queryFn: () => fetchTreeVersions(treeId),
    enabled: Number.isFinite(treeId),
  });

  const effectiveRootId = focusId ?? tree?.rootNodeId ?? null;

  const { data: ancestors = [] } = useQuery({
    queryKey: ['knowledge', 'ancestors', effectiveRootId],
    queryFn: () => fetchNodeAncestors(effectiveRootId as number),
    enabled: effectiveRootId != null,
  });

  const mergeNodes = useCallback((list: KnowledgeNode[]) => {
    setNodesById((prev) => {
      const next = { ...prev };
      list.forEach((n) => {
        next[n.id] = n;
      });
      return next;
    });
  }, []);

  // (Re)seed the tree whenever the focused root changes.
  useEffect(() => {
    if (effectiveRootId == null) return;
    let cancelled = false;
    (async () => {
      const [root, children] = await Promise.all([
        fetchKnowledgeNode(effectiveRootId),
        fetchNodeChildren(effectiveRootId),
      ]);
      if (cancelled) return;
      mergeNodes([root, ...children]);
      setTreeData([{ ...buildDataNode(root), children: children.map(buildDataNode) }]);
      setExpandedKeys([root.id]);
      setSelectedId(root.id);
    })();
    return () => {
      cancelled = true;
    };
  }, [effectiveRootId, mergeNodes, reseedNonce]);

  const loadChildren = useCallback(
    async (node: { key: React.Key }) => {
      const key = Number(node.key);
      const children = await fetchNodeChildren(key);
      mergeNodes(children);
      setTreeData((prev) => setChildrenAt(prev, key, children.map(buildDataNode)));
    },
    [mergeNodes],
  );

  /** Refresh a parent's children in place after a mutation and keep it expanded. */
  const refreshChildren = useCallback(
    async (parentId: number) => {
      const children = await fetchNodeChildren(parentId);
      mergeNodes(children);
      setTreeData((prev) => setChildrenAt(prev, parentId, children.map(buildDataNode)));
      setExpandedKeys((prev) => (prev.includes(parentId) ? prev : [...prev, parentId]));
    },
    [mergeNodes],
  );

  const invalidateMeta = () => {
    queryClient.invalidateQueries({ queryKey: ['knowledge', 'tree', treeId] });
    queryClient.invalidateQueries({ queryKey: ['knowledge', 'trees'] });
    queryClient.invalidateQueries({ queryKey: ['knowledge', 'ancestors'] });
  };

  const createM = useMutation({
    mutationFn: (values: NodeFormValues & { parentId: number }) =>
      createKnowledgeNode({
        parentId: values.parentId,
        name: values.name.trim(),
        description: values.description,
        notes: values.notes,
      }),
    onSuccess: async (created) => {
      message.success('Node added');
      setNodeModal(null);
      // The parent's childCount changed, so refresh the parent node too.
      const [freshParent] = await Promise.all([fetchKnowledgeNode(created.parentId as number)]);
      mergeNodes([freshParent]);
      await refreshChildren(created.parentId as number);
      setSelectedId(created.id);
      invalidateMeta();
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to add node')),
  });

  const updateM = useMutation({
    mutationFn: ({ nodeId, values }: { nodeId: number; values: NodeFormValues }) =>
      updateKnowledgeNode(nodeId, {
        name: values.name.trim(),
        description: values.description,
        notes: values.notes,
      }),
    onSuccess: async (updated) => {
      message.success('Node updated');
      setNodeModal(null);
      mergeNodes([updated]);
      if (updated.parentId != null) {
        await refreshChildren(updated.parentId);
      } else {
        // Root node has no parent; refresh its own title in place, keeping loaded children.
        setTreeData((prev) =>
          prev.map((n) => (n.key === updated.id ? { ...buildDataNode(updated), children: n.children } : n)),
        );
      }
      invalidateMeta();
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to update node')),
  });

  const deleteM = useMutation({
    mutationFn: (node: KnowledgeNode) => deleteKnowledgeNode(node.id),
    onSuccess: async (_data, node) => {
      message.success('Node removed');
      if (node.parentId != null) {
        const freshParent = await fetchKnowledgeNode(node.parentId);
        mergeNodes([freshParent]);
        await refreshChildren(node.parentId);
        setSelectedId(node.parentId);
      }
      invalidateMeta();
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to remove node')),
  });

  const exportM = useMutation({
    mutationFn: () => exportKnowledgeTree(treeId),
    onSuccess: (payload) => {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${(payload.name || 'knowledge-tree').replace(/[^a-z0-9-_]+/gi, '_')}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      message.success('Knowledge tree exported');
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to export knowledge tree')),
  });

  const promote = useMutation({
    mutationFn: () => setCurrentTreeVersion(treeId),
    onSuccess: () => {
      message.success('Current version updated');
      queryClient.invalidateQueries({ queryKey: ['knowledge', 'versions', treeId] });
      queryClient.invalidateQueries({ queryKey: ['knowledge', 'trees'] });
      queryClient.invalidateQueries({ queryKey: ['knowledge', 'tree', treeId] });
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to set current version')),
  });

  const updateFromJsonM = useMutation({
    mutationFn: (payload: ImportKnowledgeTreePayload) => updateKnowledgeTreeFromImport(treeId, payload),
    onSuccess: () => {
      message.success('Knowledge tree updated');
      setUpdateOpen(false);
      setUpdateText('');
      setFocusId(null);
      setSelectedId(null);
      setReseedNonce((n) => n + 1);
      invalidateMeta();
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to update knowledge tree')),
  });

  const submitUpdate = () => {
    let payload: ImportKnowledgeTreePayload;
    try {
      payload = JSON.parse(updateText) as ImportKnowledgeTreePayload;
    } catch {
      message.error('Invalid JSON');
      return;
    }
    updateFromJsonM.mutate(payload);
  };

  const onUpdateFile = (file: File) => {
    file.text().then((text) => setUpdateText(text));
    return false;
  };

  const moveM = useMutation({
    mutationFn: (vars: { id: number; oldParentId: number | null; newParentId: number; newOrderIndex?: number }) =>
      moveKnowledgeNode(vars.id, { newParentId: vars.newParentId, newOrderIndex: vars.newOrderIndex }),
    onSuccess: async (moved, vars) => {
      message.success('Node moved');
      // Both the previous and the new parent's child lists (and counts) changed.
      const affected = new Set<number>();
      if (vars.oldParentId != null) affected.add(vars.oldParentId);
      if (moved.parentId != null) affected.add(moved.parentId);
      for (const pid of affected) {
        const freshParent = await fetchKnowledgeNode(pid);
        mergeNodes([freshParent]);
        await refreshChildren(pid);
      }
      mergeNodes([moved]);
      setSelectedId(moved.id);
      invalidateMeta();
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to move node')),
  });

  const onDrop = (info: {
    dragNode: { key: React.Key };
    node: { key: React.Key; pos: string };
    dropPosition: number;
    dropToGap: boolean;
  }) => {
    const dragId = Number(info.dragNode.key);
    const targetId = Number(info.node.key);
    const dragNode = nodesById[dragId];
    const target = nodesById[targetId];
    if (!dragNode || !target) return;
    if (dragNode.parentId == null) {
      message.warning('The root node cannot be moved');
      return;
    }
    // Prevent dropping a node into itself or one of its own descendants.
    if (target.path.startsWith(dragNode.path)) {
      message.warning('Cannot move a node into itself or its own sub-node');
      return;
    }

    if (!info.dropToGap) {
      // Dropped onto a node: append as its last child (cross-level re-parent).
      moveM.mutate({ id: dragId, oldParentId: dragNode.parentId, newParentId: targetId });
      return;
    }
    // Dropped into a gap: become a sibling of the target under the target's parent.
    if (target.parentId == null) {
      message.warning('Cannot place a node beside the root');
      return;
    }
    // relativePos: -1 = above the target, 1 = below it.
    const targetSlot = Number(info.node.pos.split('-').pop());
    const relativePos = info.dropPosition - targetSlot;
    const insertIndex = relativePos < 0 ? target.orderIndex : target.orderIndex + 1;
    moveM.mutate({
      id: dragId,
      oldParentId: dragNode.parentId,
      newParentId: target.parentId,
      newOrderIndex: insertIndex,
    });
  };

  const selectedNode = selectedId != null ? nodesById[selectedId] : undefined;
  const rootId = tree?.rootNodeId ?? null;

  const openCreate = (parentId: number) => {
    setNodeModal({ mode: 'create', parentId });
  };

  const openEdit = (node: KnowledgeNode) => {
    setNodeModal({ mode: 'edit', node });
  };

  const submitNode = async () => {
    const values = await form.validateFields();
    if (nodeModal?.mode === 'create') createM.mutate({ ...values, parentId: nodeModal.parentId });
    else if (nodeModal?.mode === 'edit') updateM.mutate({ nodeId: nodeModal.node.id, values });
  };

  const breadcrumbItems = useMemo(() => {
    const items = ancestors.map((a) => ({
      title:
        a.id === effectiveRootId ? (
          <span style={{ fontWeight: 600 }}>{a.name}</span>
        ) : (
          <a onClick={() => setFocusId(a.id === rootId ? null : a.id)}>{a.name}</a>
        ),
    }));
    return [
      {
        title: (
          <a onClick={() => setFocusId(null)}>
            <HomeOutlined /> {tree?.name ?? 'Root'}
          </a>
        ),
      },
      ...items.slice(1),
    ];
  }, [ancestors, effectiveRootId, rootId, tree?.name]);

  const nodeActionItems: MenuProps['items'] = selectedNode
    ? [
        {
          key: 'drill',
          icon: <AimOutlined />,
          label: 'Drill into',
          disabled: selectedNode.id === effectiveRootId,
          onClick: () => setFocusId(selectedNode.id === rootId ? null : selectedNode.id),
        },
        {
          key: 'edit',
          icon: <EditOutlined />,
          label: 'Edit',
          onClick: () => openEdit(selectedNode),
        },
        ...(selectedNode.parentId != null
          ? [
              { type: 'divider' as const },
              {
                key: 'delete',
                icon: <DeleteOutlined />,
                label: 'Delete',
                danger: true,
                onClick: () =>
                  modal.confirm({
                    title: 'Delete this node?',
                    content: 'All of its sub-nodes will be removed.',
                    okText: 'Delete',
                    okButtonProps: { danger: true },
                    onOk: () => deleteM.mutate(selectedNode),
                  }),
              },
            ]
          : []),
      ]
    : [];

  // Kept in sync with treeData so Ant never skips reloading a node whose children were dropped by a refresh.
  const loadedKeys = collectLoadedKeys(treeData);

  const versionMenuItems: MenuProps['items'] = [
    ...versions.map((v) => ({
      key: `v-${v.id}`,
      icon: v.id === treeId ? <CheckOutlined /> : <span style={{ display: 'inline-block', width: 14 }} />,
      label: (
        <Space size={6}>
          <span style={{ fontWeight: v.isCurrent ? 600 : 400 }}>v{v.version}</span>
          {v.isCurrent && <Tag color="blue" style={{ marginInlineEnd: 0 }}>current</Tag>}
          {v.versionLabel && (
            <Typography.Text type="secondary" ellipsis style={{ maxWidth: 160 }}>
              {v.versionLabel}
            </Typography.Text>
          )}
        </Space>
      ),
      onClick: () => {
        if (v.id !== treeId) navigate(`/knowledge/edit/${v.id}`);
      },
    })),
    { type: 'divider' as const },
    ...(tree && !tree.isCurrent
      ? [
          {
            key: 'set-current',
            icon: <StarOutlined />,
            label: 'Set this version as current',
            onClick: () => promote.mutate(),
          },
        ]
      : []),
    { key: 'manage', icon: <BranchesOutlined />, label: 'Manage versions\u2026', onClick: () => setVersionsOpen(true) },
  ];

  if (treeLoading || !tree) {
    return <Spin style={{ display: 'block', margin: '80px auto' }} />;
  }

  return (
    <div>
      <Space style={{ justifyContent: 'space-between', width: '100%', marginBottom: 12 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/knowledge')}>
            Trees
          </Button>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {tree.name}
          </Typography.Title>
          <Dropdown menu={{ items: versionMenuItems }} trigger={['click']}>
            <Tag
              color={tree.isCurrent ? 'blue' : 'default'}
              style={{ marginInlineEnd: 0, cursor: 'pointer', userSelect: 'none' }}
            >
              v{tree.version}
              {tree.isCurrent ? ' · current' : ''}
              <DownOutlined style={{ fontSize: 10, marginInlineStart: 4 }} />
            </Tag>
          </Dropdown>
          <Tag>{tree.nodeCount} nodes</Tag>
        </Space>
        <Space>
          <Button icon={<ExportOutlined />} loading={exportM.isPending} onClick={() => exportM.mutate()}>
            Export
          </Button>
          <Button icon={<ImportOutlined />} onClick={() => setUpdateOpen(true)}>
            Update from JSON
          </Button>
        </Space>
      </Space>

      <Breadcrumb style={{ marginBottom: 12 }} items={breadcrumbItems} />

      <Row gutter={16}>
        <Col xs={24} md={11} lg={10}>
          <Card size="small" styles={{ body: { maxHeight: '65vh', overflow: 'auto' } }}>
            {treeData.length === 0 ? (
              <Empty description="Empty" />
            ) : (
              <Tree
                treeData={treeData}
                loadData={loadChildren}
                loadedKeys={loadedKeys}
                draggable={{ icon: false }}
                onDrop={onDrop}
                expandedKeys={expandedKeys}
                onExpand={(keys) => setExpandedKeys(keys.map(Number))}
                selectedKeys={selectedId != null ? [selectedId] : []}
                onSelect={(keys) => setSelectedId(keys.length ? Number(keys[0]) : null)}
                onDoubleClick={(_e, node) => setFocusId(Number(node.key))}
                blockNode
              />
            )}
          </Card>
        </Col>
        <Col xs={24} md={13} lg={14}>
          {!selectedNode ? (
            <Card size="small">
              <Empty description="Select a node" />
            </Card>
          ) : (
            <Card
              size="small"
              title={
                <Space size={8} wrap>
                  <span>{selectedNode.name}</span>
                  {selectedNode.parentId == null && <Tag color="green">root</Tag>}
                  <Tag>Depth {selectedNode.depth}</Tag>
                  <Tag>{selectedNode.childCount} sub-nodes</Tag>
                </Space>
              }
              extra={
                <Space>
                  <Button
                    type="primary"
                    size="small"
                    icon={<PlusOutlined />}
                    onClick={() => openCreate(selectedNode.id)}
                  >
                    Add sub
                  </Button>
                  <Dropdown menu={{ items: nodeActionItems }} trigger={['click']}>
                    <Button size="small" icon={<MoreOutlined />} />
                  </Dropdown>
                </Space>
              }
            >
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                {ancestors.length > 0 && selectedNode.id === effectiveRootId && (
                  <Typography.Text type="secondary">
                    {ancestors.map((a) => a.name).join(' / ')}
                  </Typography.Text>
                )}

                <Descriptions column={1} size="small" styles={{ label: { width: 120 } }}>
                  <Descriptions.Item label="Description">
                    {selectedNode.description ? (
                      <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>
                        {selectedNode.description}
                      </Typography.Paragraph>
                    ) : (
                      <Typography.Text type="secondary">—</Typography.Text>
                    )}
                  </Descriptions.Item>
                  <Descriptions.Item label="Notes">
                    {selectedNode.notes ? (
                      <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>
                        {selectedNode.notes}
                      </Typography.Paragraph>
                    ) : (
                      <Typography.Text type="secondary">—</Typography.Text>
                    )}
                  </Descriptions.Item>
                </Descriptions>
              </Space>
            </Card>
          )}
        </Col>
      </Row>

      <Modal
        open={nodeModal !== null}
        title={nodeModal?.mode === 'edit' ? 'Edit node' : 'Add sub-knowledge'}
        onCancel={() => setNodeModal(null)}
        onOk={submitNode}
        confirmLoading={createM.isPending || updateM.isPending}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          preserve={false}
          initialValues={
            nodeModal?.mode === 'edit'
              ? {
                  name: nodeModal.node.name,
                  description: nodeModal.node.description ?? undefined,
                  notes: nodeModal.node.notes ?? undefined,
                }
              : undefined
          }
        >
          <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Name is required' }]}>
            <Input maxLength={200} placeholder="e.g. Segment terminators" />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={3} maxLength={4000} placeholder="Optional" />
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={3} maxLength={4000} placeholder="Optional" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={updateOpen}
        title="Update tree from JSON"
        okText="Update"
        onCancel={() => setUpdateOpen(false)}
        onOk={submitUpdate}
        confirmLoading={updateFromJsonM.isPending}
        destroyOnClose
      >
        <Typography.Paragraph type="secondary">
          Nodes are matched by their exported <code>ref</code>: existing ones are updated in place, new
          ones are added, and any missing from the JSON are removed.
        </Typography.Paragraph>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Upload.Dragger accept=".json,application/json" showUploadList={false} beforeUpload={onUpdateFile}>
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">Drag a JSON file here, or click to browse</p>
          </Upload.Dragger>
          <Input.TextArea
            rows={12}
            value={updateText}
            onChange={(e) => setUpdateText(e.target.value)}
            placeholder='{ "name": "...", "nodes": [ ... ] }'
          />
        </Space>
      </Modal>

      {versionsOpen && (
        <KnowledgeVersionManagerModal
          open
          treeId={treeId}
          onClose={() => setVersionsOpen(false)}
        />
      )}
    </div>
  );
}
