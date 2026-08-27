import { useMemo, useState } from 'react';
import type { Key } from 'react';
import {
  App as AntApp,
  Breadcrumb,
  Button,
  Card,
  Col,
  Dropdown,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Space,
  Spin,
  Switch,
  Table,
  Tabs,
  Tag,
  Timeline,
  Tooltip,
  Tree,
  Typography,
  Upload,
} from 'antd';
import type { MenuProps, UploadProps } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { DataNode, TreeProps } from 'antd/es/tree';
import {
  ArrowLeftOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  FileOutlined,
  FileTextOutlined,
  FolderAddOutlined,
  FolderOpenOutlined,
  FolderOutlined,
  HomeOutlined,
  InboxOutlined,
  ScheduleOutlined,
  SaveOutlined,
  SearchOutlined,
  SwapOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  advanceArtifact,
  assignChecklistItem,
  createFolder,
  deleteArtifact,
  deleteNode,
  downloadNode,
  exportArtifact,
  fetchArtifact,
  fetchChecklist,
  fetchHistory,
  moveNode,
  renameNode,
  saveArtifactAsTemplate,
  updateNodeNotes,
  uploadFiles,
  type ArtifactNode,
} from '../../api/artifacts';
import { extractErrorMessage } from '../../api/client';
import { AdvanceStatusModal } from './AdvanceStatusModal';
import { ChecklistTab } from './ChecklistTab';
import { LogsPanel } from './LogsPanel';

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

// Sentinel tree key representing the artifact's top level (root).
const ROOT_KEY = '__root__';

function toTreeData(nodes: ArtifactNode[]): DataNode[] {
  return nodes.map((n) => ({
    key: n.id,
    icon: n.folder ? <FolderOutlined /> : <FileOutlined />,
    title: n.folder ? n.name : `${n.name}  ·  ${formatBytes(n.sizeBytes)}`,
    children: n.folder ? toTreeData(n.children) : undefined,
  }));
}

function findNode(nodes: ArtifactNode[], id: number): ArtifactNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const found = findNode(n.children ?? [], id);
    if (found) return found;
  }
  return null;
}

// Flat lookup of every node by id (built once per artifact tree).
function buildIndex(nodes: ArtifactNode[]): Map<number, ArtifactNode> {
  const byId = new Map<number, ArtifactNode>();
  const walk = (list: ArtifactNode[]) => {
    for (const n of list) {
      byId.set(n.id, n);
      if (n.children?.length) walk(n.children);
    }
  };
  walk(nodes);
  return byId;
}

// Folder nodes from the root down to (but excluding) the given node.
function ancestorFolders(byId: Map<number, ArtifactNode>, id: number): ArtifactNode[] {
  const chain: ArtifactNode[] = [];
  let cur = byId.get(id);
  while (cur && cur.parentId != null) {
    const parent = byId.get(cur.parentId);
    if (!parent) break;
    chain.unshift(parent);
    cur = parent;
  }
  return chain;
}

interface FlatFile {
  node: ArtifactNode;
  relPath: string;
}

// Collect files under a folder (null = artifact root). When recursive, descend into subfolders.
function collectFiles(
  root: ArtifactNode[],
  byId: Map<number, ArtifactNode>,
  folderId: number | null,
  recursive: boolean,
): FlatFile[] {
  const start = folderId == null ? root : byId.get(folderId)?.children ?? [];
  const out: FlatFile[] = [];
  const baseDepth = folderId == null ? 0 : ancestorFolders(byId, folderId).length + 1;
  const walk = (list: ArtifactNode[]) => {
    for (const n of list) {
      if (n.folder) {
        if (recursive) walk(n.children ?? []);
      } else {
        const rel = ancestorFolders(byId, n.id).slice(baseDepth).map((f) => f.name).join('/');
        out.push({ node: n, relPath: rel });
      }
    }
  };
  walk(start);
  return out;
}


export function ArtifactDetailPage() {
  const { id } = useParams();
  const artifactId = Number(id);
  const navigate = useNavigate();
  const { message } = AntApp.useApp();
  const queryClient = useQueryClient();

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [folderForm] = Form.useForm<{ name: string }>();
  const [folderOpen, setFolderOpen] = useState(false);
  const [folderParentId, setFolderParentId] = useState<number | null>(null);
  const [renameForm] = Form.useForm<{ name: string }>();
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameNodeId, setRenameNodeId] = useState<number | null>(null);
  const [notesForm] = Form.useForm<{ notes: string }>();
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesNode, setNotesNode] = useState<ArtifactNode | null>(null);
  const [menuNode, setMenuNode] = useState<ArtifactNode | null>(null);
  const [saveTemplateForm] = Form.useForm<{ name: string; description?: string; isDefault: boolean }>();
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState<Key[]>([ROOT_KEY]);
  const [fileFilter, setFileFilter] = useState('');
  const [includeSubfolders, setIncludeSubfolders] = useState(true);

  const { data: artifact, isLoading } = useQuery({
    queryKey: ['artifacts', artifactId],
    queryFn: () => fetchArtifact(artifactId),
    enabled: Number.isFinite(artifactId),
  });
  const { data: history = [] } = useQuery({
    queryKey: ['artifacts', artifactId, 'history'],
    queryFn: () => fetchHistory(artifactId),
    enabled: Number.isFinite(artifactId),
  });
  const { data: checklist } = useQuery({
    queryKey: ['artifacts', artifactId, 'checklist'],
    queryFn: () => fetchChecklist(artifactId),
    enabled: Number.isFinite(artifactId),
  });

  const treeData = useMemo<DataNode[]>(
    () =>
      artifact
        ? [
            {
              key: ROOT_KEY,
              icon: <HomeOutlined />,
              title: `${artifact.name} (top level)`,
              children: toTreeData(artifact.nodes),
            },
          ]
        : [],
    [artifact],
  );
  const selectedNode = artifact && selectedId != null ? findNode(artifact.nodes, selectedId) : null;

  // Folder that uploads/new-folders target: the selected folder, a selected file's parent, or root.
  const targetFolderId = selectedNode
    ? selectedNode.folder
      ? selectedNode.id
      : selectedNode.parentId
    : null;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['artifacts', artifactId] });
    queryClient.invalidateQueries({ queryKey: ['artifacts'] });
  };

  const byId = useMemo(() => buildIndex(artifact?.nodes ?? []), [artifact]);

  // Files shown in the right-hand list for the current target folder.
  const flatFiles = useMemo<FlatFile[]>(
    () => (artifact ? collectFiles(artifact.nodes, byId, targetFolderId, includeSubfolders) : []),
    [artifact, byId, targetFolderId, includeSubfolders],
  );
  const filteredFiles = useMemo(() => {
    const q = fileFilter.trim().toLowerCase();
    if (!q) return flatFiles;
    return flatFiles.filter(
      (f) => f.node.name.toLowerCase().includes(q) || f.relPath.toLowerCase().includes(q),
    );
  }, [flatFiles, fileFilter]);

  // Expand every ancestor folder of a node and select it, so a list click reveals it in the tree.
  const revealInTree = (id: number) => {
    const ancestorKeys = ancestorFolders(byId, id).map((f) => f.id);
    setExpandedKeys((prev) => Array.from(new Set<Key>([...prev, ROOT_KEY, ...ancestorKeys])));
    setSelectedId(id);
  };

  const advance = useMutation({
    mutationFn: (values: { toStepId: number; comment?: string }) => advanceArtifact(artifactId, values),
    onSuccess: () => {
      message.success('Status updated');
      setAdvanceOpen(false);
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['artifacts', artifactId, 'history'] });
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to update status')),
  });

  const addFolder = useMutation({
    mutationFn: (name: string) => createFolder(artifactId, { parentId: folderParentId, name }),
    onSuccess: () => {
      message.success('Folder created');
      setFolderOpen(false);
      folderForm.resetFields();
      invalidate();
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to create folder')),
  });

  const renameNodeMutation = useMutation({
    mutationFn: ({ nodeId, name }: { nodeId: number; name: string }) => renameNode(artifactId, nodeId, name),
    onSuccess: () => {
      message.success('Renamed');
      setRenameOpen(false);
      setRenameNodeId(null);
      renameForm.resetFields();
      invalidate();
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to rename')),
  });

  const notesMutation = useMutation({
    mutationFn: ({ nodeId, notes }: { nodeId: number; notes: string }) =>
      updateNodeNotes(artifactId, nodeId, notes),
    onSuccess: () => {
      message.success('Notes saved');
      setNotesOpen(false);
      setNotesNode(null);
      notesForm.resetFields();
      invalidate();
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to save notes')),
  });

  const moveNodeMutation = useMutation({
    mutationFn: ({ nodeId, parentId }: { nodeId: number; parentId: number | null }) =>
      moveNode(artifactId, nodeId, parentId),
    onSuccess: () => {
      message.success('Moved');
      invalidate();
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to move')),
  });

  const assignChecklist = useMutation({
    mutationFn: ({ itemId, nodeId }: { itemId: number; nodeId: number | null }) =>
      assignChecklistItem(artifactId, itemId, nodeId),
    onSuccess: (view) => {
      queryClient.setQueryData(['artifacts', artifactId, 'checklist'], view);
      queryClient.invalidateQueries({ queryKey: ['artifacts', artifactId] });
      message.success('Checklist updated');
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to update checklist')),
  });

  const removeNode = useMutation({
    mutationFn: (nodeId: number) => deleteNode(artifactId, nodeId),
    onSuccess: () => {
      message.success('Deleted');
      setSelectedId(null);
      invalidate();
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to delete')),
  });

  const removeArtifact = useMutation({
    mutationFn: () => deleteArtifact(artifactId),
    onSuccess: () => {
      message.success('Artifact deleted');
      navigate('/artifacts');
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to delete artifact')),
  });

  const saveAsTemplate = useMutation({
    mutationFn: (values: { name: string; description?: string; isDefault: boolean }) =>
      saveArtifactAsTemplate(artifactId, {
        name: values.name.trim(),
        description: values.description?.trim() || null,
        isDefault: values.isDefault,
      }),
    onSuccess: () => {
      message.success('Template saved');
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      setSaveTemplateOpen(false);
      saveTemplateForm.resetFields();
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to save template')),
  });

  const uploadProps: UploadProps = {
    multiple: true,
    showUploadList: false,
    customRequest: async ({ file, onSuccess, onError }) => {
      try {
        await uploadFiles(artifactId, targetFolderId, [file as File]);
        onSuccess?.({});
        invalidate();
      } catch (e) {
        onError?.(e as Error);
        message.error(extractErrorMessage(e, 'Upload failed'));
      }
    },
  };

  const handleDownload = async (node: ArtifactNode) => {
    try {
      await downloadNode(artifactId, node.id, node.name);
    } catch (e) {
      message.error(extractErrorMessage(e, 'Download failed'));
    }
  };

  const handleExport = async () => {
    if (!artifact) return;
    try {
      await exportArtifact(artifactId, `${artifact.ediRef || artifact.name}.zip`);
    } catch (e) {
      message.error(extractErrorMessage(e, 'Export failed'));
    }
  };

  const openRename = (node: ArtifactNode) => {
    setRenameNodeId(node.id);
    renameForm.setFieldsValue({ name: node.name });
    setRenameOpen(true);
  };

  const openNotes = (node: ArtifactNode) => {
    setNotesNode(node);
    notesForm.setFieldsValue({ notes: node.notes ?? '' });
    setNotesOpen(true);
  };

  const openNewFolder = (parentId: number | null) => {
    setFolderParentId(parentId);
    setFolderOpen(true);
  };

  const confirmDelete = (node: ArtifactNode) => {
    Modal.confirm({
      title: node.folder ? 'Delete folder and its contents?' : 'Delete this file?',
      okText: 'Delete',
      okButtonProps: { danger: true },
      onOk: () => removeNode.mutateAsync(node.id),
    });
  };

  const contextMenuItems: MenuProps['items'] = menuNode
    ? menuNode.folder
      ? [
          { key: 'rename', icon: <EditOutlined />, label: 'Rename' },
          { key: 'notes', icon: <FileTextOutlined />, label: 'Notes' },
          { key: 'newFolder', icon: <FolderAddOutlined />, label: 'New subfolder' },
          { type: 'divider' },
          { key: 'delete', icon: <DeleteOutlined />, label: 'Delete', danger: true },
        ]
      : [
          { key: 'rename', icon: <EditOutlined />, label: 'Rename' },
          { key: 'notes', icon: <FileTextOutlined />, label: 'Notes' },
          { key: 'download', icon: <DownloadOutlined />, label: 'Download' },
          {
            key: 'fulfill',
            icon: <ScheduleOutlined />,
            label: 'Fulfill checklist item',
            children: (() => {
              const items = checklist?.folders.find((f) => f.folderNodeId === (menuNode.parentId ?? null))?.items ?? [];
              return items.length
                ? items.map((it) => ({
                    key: `assign:${it.id}`,
                    label: `${it.satisfiedByNodeId === menuNode.id ? '✔ ' : ''}${it.label}${it.required ? ' *' : ''}`,
                  }))
                : [{ key: 'noChecklist', label: 'No checklist items in this folder', disabled: true }];
            })(),
          },
          { type: 'divider' },
          { key: 'delete', icon: <DeleteOutlined />, label: 'Delete', danger: true },
        ]
    : // Root node: only the top-level "new folder" action makes sense.
      [{ key: 'newFolder', icon: <FolderAddOutlined />, label: 'New folder' }];

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'newFolder') {
      openNewFolder(menuNode ? menuNode.id : null);
      return;
    }
    if (!menuNode) return;
    if (typeof key === 'string' && key.startsWith('assign:')) {
      assignChecklist.mutate({ itemId: Number(key.slice('assign:'.length)), nodeId: menuNode.id });
      return;
    }
    if (key === 'rename') openRename(menuNode);
    else if (key === 'notes') openNotes(menuNode);
    else if (key === 'download') handleDownload(menuNode);
    else if (key === 'delete') confirmDelete(menuNode);
  };

  const handleDrop: TreeProps['onDrop'] = (info) => {
    if (!artifact) return;
    const dragKey = info.dragNode.key;
    if (dragKey === ROOT_KEY) return;
    const dropKey = info.node.key;
    let targetParentId: number | null;
    if (dropKey === ROOT_KEY) {
      targetParentId = null;
    } else {
      const dropNode = findNode(artifact.nodes, Number(dropKey));
      if (!dropNode) return;
      // Dropped directly onto a folder → move inside it; otherwise use the drop target's parent.
      targetParentId = !info.dropToGap && dropNode.folder ? dropNode.id : dropNode.parentId;
    }
    moveNodeMutation.mutate({ nodeId: Number(dragKey), parentId: targetParentId });
  };

  if (isLoading) return <Spin />;
  if (!artifact) return <Empty description="Artifact not found" />;

  const targetFolderName = targetFolderId
    ? findNode(artifact.nodes, targetFolderId)?.name ?? 'root'
    : 'root (top level)';

  const folderParentName = folderParentId
    ? findNode(artifact.nodes, folderParentId)?.name ?? 'root'
    : 'root (top level)';

  // Breadcrumb from artifact root down to the currently selected node.
  const crumbNodes = selectedNode ? [...ancestorFolders(byId, selectedNode.id), selectedNode] : [];
  const breadcrumbItems = [
    {
      title: (
        <a onClick={() => setSelectedId(null)}>
          <HomeOutlined /> {artifact.name}
        </a>
      ),
    },
    ...crumbNodes.map((n) => ({
      title: n.folder ? (
        <a onClick={() => revealInTree(n.id)}>{n.name}</a>
      ) : (
        <span>{n.name}</span>
      ),
    })),
  ];

  const fileColumns: ColumnsType<FlatFile> = [
    {
      title: 'Name',
      key: 'name',
      width: 200,
      ellipsis: true,
      render: (_, r) => (
        <Space size={6} style={{ maxWidth: '100%' }}>
          <FileOutlined />
          <a onClick={() => revealInTree(r.node.id)} title={r.node.name} style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {r.node.name}
          </a>
        </Space>
      ),
      sorter: (a, b) => a.node.name.localeCompare(b.node.name),
    },
    {
      title: 'Path',
      dataIndex: 'relPath',
      key: 'relPath',
      width: 120,
      ellipsis: true,
      render: (v: string) =>
        v ? <Tag>{v}</Tag> : <Typography.Text type="secondary">current folder</Typography.Text>,
    },
    {
      title: 'Size',
      key: 'size',
      width: 90,
      align: 'right',
      render: (_, r) => formatBytes(r.node.sizeBytes),
      sorter: (a, b) => a.node.sizeBytes - b.node.sizeBytes,
    },
    {
      title: '',
      key: 'actions',
      width: 110,
      render: (_, r) => (
        <Space size="small">
          <Tooltip title="Download">
            <Button type="text" size="small" icon={<DownloadOutlined />} onClick={() => handleDownload(r.node)} />
          </Tooltip>
          <Tooltip title="Notes">
            <Button
              type="text"
              size="small"
              icon={<FileTextOutlined style={r.node.notes ? { color: '#1677ff' } : undefined} />}
              onClick={() => openNotes(r.node)}
            />
          </Tooltip>
          <Tooltip title="Rename">
            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openRename(r.node)} />
          </Tooltip>
          <Popconfirm title="Delete this file?" onConfirm={() => removeNode.mutate(r.node.id)}>
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const filesTab = (
    <div>
      <Breadcrumb items={breadcrumbItems} style={{ marginBottom: 12 }} />
      <Row gutter={16}>
        <Col xs={24} lg={9}>
          <Card
            size="small"
            title="Folders"
            extra={
              <Button size="small" icon={<FolderAddOutlined />} onClick={() => openNewFolder(targetFolderId)}>
                New folder
              </Button>
            }
          >
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Right-click a node for actions · drag to move
            </Typography.Text>
            <Dropdown menu={{ items: contextMenuItems, onClick: handleMenuClick }} trigger={['contextMenu']}>
              <div style={{ maxHeight: 480, overflow: 'auto', marginTop: 8 }}>
                <Tree
                  showIcon
                  showLine
                  blockNode
                  draggable={{ icon: false, nodeDraggable: (node) => node.key !== ROOT_KEY }}
                  treeData={treeData}
                  expandedKeys={expandedKeys}
                  onExpand={(keys) => setExpandedKeys(keys)}
                  selectedKeys={[selectedId ?? ROOT_KEY]}
                  onSelect={(keys) => {
                    const key = keys[0];
                    setSelectedId(key == null || key === ROOT_KEY ? null : Number(key));
                  }}
                  onRightClick={({ node }) => {
                    const key = node.key;
                    setMenuNode(key === ROOT_KEY ? null : findNode(artifact.nodes, Number(key)));
                  }}
                  onDrop={handleDrop}
                />
              </div>
            </Dropdown>

            <Upload.Dragger {...uploadProps} style={{ marginTop: 16 }}>
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">Drag files here to upload into “{targetFolderName}”</p>
            </Upload.Dragger>
          </Card>
        </Col>

        <Col xs={24} lg={15}>
          <Card
            size="small"
            title={
              <Space size={4}>
                <FolderOpenOutlined />
                <span>Files in “{targetFolderName}”</span>
              </Space>
            }
            extra={
              <Upload {...uploadProps}>
                <Button size="small" type="primary" icon={<UploadOutlined />}>
                  Upload
                </Button>
              </Upload>
            }
          >
            <Space style={{ marginBottom: 12 }} wrap>
              <Input
                allowClear
                prefix={<SearchOutlined />}
                placeholder="Filter by name or path"
                value={fileFilter}
                onChange={(e) => setFileFilter(e.target.value)}
                style={{ width: 260 }}
              />
              <Space size={4}>
                <Switch size="small" checked={includeSubfolders} onChange={setIncludeSubfolders} />
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Include subfolders
                </Typography.Text>
              </Space>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {filteredFiles.length} file{filteredFiles.length === 1 ? '' : 's'}
              </Typography.Text>
            </Space>
            <Table<FlatFile>
              size="small"
              rowKey={(r) => r.node.id}
              columns={fileColumns}
              dataSource={filteredFiles}
              scroll={{ x: 'max-content' }}
              pagination={{ pageSize: 20, hideOnSinglePage: true, size: 'small' }}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No files" /> }}
              onRow={(r) => ({ onClick: () => revealInTree(r.node.id) })}
              rowClassName={(r) => (r.node.id === selectedId ? 'ant-table-row-selected' : '')}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );

  const workflowTab = (
    <Row gutter={16}>
      <Col xs={24} lg={12}>
        <Card
          title="Workflow status"
          extra={
            <Button size="small" icon={<SwapOutlined />} onClick={() => setAdvanceOpen(true)}>
              Update status
            </Button>
          }
          style={{ marginBottom: 16 }}
        >
          <Space direction="vertical">
            <div>
              Current step:{' '}
              {artifact.currentStepName ? (
                <Tag color="blue">{artifact.currentStepName}</Tag>
              ) : (
                <Tag>Not started</Tag>
              )}
            </div>
            <Typography.Text type="secondary">
              Created {dayjs(artifact.createdAt).format('YYYY-MM-DD HH:mm')} · Updated{' '}
              {dayjs(artifact.updatedAt).format('YYYY-MM-DD HH:mm')}
            </Typography.Text>
          </Space>
        </Card>

        <Card title="Status history">
          {history.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No status changes yet" />
          ) : (
            <Timeline
              items={history.map((h) => ({
                children: (
                  <Space direction="vertical" size={0}>
                    <span>
                      {h.fromStepName ? `${h.fromStepName} → ` : 'Set to '}
                      <b>{h.toStepName}</b>
                    </span>
                    {h.comment && <Typography.Text type="secondary">{h.comment}</Typography.Text>}
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {h.changedByName} · {dayjs(h.changedAt).format('YYYY-MM-DD HH:mm')}
                    </Typography.Text>
                  </Space>
                ),
              }))}
            />
          )}
        </Card>
      </Col>

      <Col xs={24} lg={12}>
        <LogsPanel artifactId={artifactId} exportTitle={artifact.ediRef || artifact.name} />
      </Col>
    </Row>
  );

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/artifacts')} />
          <Typography.Title level={4} style={{ margin: 0 }}>
            {artifact.name}
          </Typography.Title>
          {artifact.ediRef && <Tag>{artifact.ediRef}</Tag>}
          {artifact.currentStepName ? (
            <Tag color="blue">{artifact.currentStepName}</Tag>
          ) : (
            <Tag>Not started</Tag>
          )}
        </Space>
        <Space>
          <Button icon={<DownloadOutlined />} onClick={handleExport}>
            Export ZIP
          </Button>
          <Button icon={<SaveOutlined />} onClick={() => setSaveTemplateOpen(true)}>
            Save as template
          </Button>
          <Popconfirm title="Delete this artifact?" onConfirm={() => removeArtifact.mutate()}>
            <Button danger icon={<DeleteOutlined />}>
              Delete
            </Button>
          </Popconfirm>
        </Space>
      </Row>

      <Tabs
        defaultActiveKey="files"
        items={[
          { key: 'files', label: 'Files', children: filesTab },
          {
            key: 'checklist',
            label: (
              <Space size={6}>
                <ScheduleOutlined />
                Checklist
                {checklist && checklist.summary.mandatoryTotal > 0 && (
                  <Tag
                    color={checklist.summary.complete ? 'success' : 'warning'}
                    style={{ marginInlineEnd: 0 }}
                  >
                    {checklist.summary.mandatorySatisfied}/{checklist.summary.mandatoryTotal}
                  </Tag>
                )}
              </Space>
            ),
            children: <ChecklistTab artifactId={artifactId} nodes={artifact.nodes} />,
          },
          { key: 'workflow', label: 'Workflow & Logs', children: workflowTab },
        ]}
      />

      <AdvanceStatusModal
        open={advanceOpen}
        currentStepId={artifact.currentStepId}
        confirmLoading={advance.isPending}
        onCancel={() => setAdvanceOpen(false)}
        onSubmit={(values) => advance.mutate(values)}
      />

      <Modal
        open={saveTemplateOpen}
        title="Save as template"
        okText="Save"
        confirmLoading={saveAsTemplate.isPending}
        onCancel={() => setSaveTemplateOpen(false)}
        onOk={() => saveTemplateForm.submit()}
        destroyOnClose
      >
        <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
          Saves the current folder structure and checklist as a new template. Files are not included.
        </Typography.Paragraph>
        <Form
          form={saveTemplateForm}
          layout="vertical"
          initialValues={{ name: artifact.name, isDefault: false }}
          onFinish={(v) => saveAsTemplate.mutate(v)}
          requiredMark={false}
        >
          <Form.Item name="name" label="Template name" rules={[{ required: true, message: 'Name is required' }]}>
            <Input placeholder="e.g. JP-MBL standard layout" autoFocus />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} placeholder="Optional" />
          </Form.Item>
          <Form.Item name="isDefault" label="Set as default template" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={folderOpen}
        title={`New folder in “${folderParentName}”`}
        okText="Create"
        confirmLoading={addFolder.isPending}
        onCancel={() => setFolderOpen(false)}
        onOk={() => folderForm.submit()}
        destroyOnClose
      >
        <Form form={folderForm} layout="vertical" onFinish={(v) => addFolder.mutate(v.name)} requiredMark={false}>
          <Form.Item name="name" label="Folder name" rules={[{ required: true, message: 'Name is required' }]}>
            <Input placeholder="e.g. UAT" autoFocus />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={renameOpen}
        title="Rename"
        okText="Save"
        confirmLoading={renameNodeMutation.isPending}
        onCancel={() => setRenameOpen(false)}
        onOk={() => renameForm.submit()}
        destroyOnClose
      >
        <Form
          form={renameForm}
          layout="vertical"
          onFinish={(v) => renameNodeId != null && renameNodeMutation.mutate({ nodeId: renameNodeId, name: v.name })}
          requiredMark={false}
        >
          <Form.Item name="name" label="New name" rules={[{ required: true, message: 'Name is required' }]}>
            <Input autoFocus />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={notesOpen}
        title={notesNode ? `Notes · ${notesNode.name}` : 'Notes'}
        okText="Save"
        confirmLoading={notesMutation.isPending}
        onCancel={() => setNotesOpen(false)}
        onOk={() => notesForm.submit()}
        destroyOnClose
      >
        <Form
          form={notesForm}
          layout="vertical"
          onFinish={(v) => notesNode != null && notesMutation.mutate({ nodeId: notesNode.id, notes: v.notes ?? '' })}
          requiredMark={false}
        >
          <Form.Item
            name="notes"
            label="Notes"
            extra="Record what was changed, what still needs work, etc."
          >
            <Input.TextArea
              autoFocus
              rows={8}
              maxLength={10000}
              showCount
              placeholder="e.g. Updated mapping for segment X. TODO: confirm date format."
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
