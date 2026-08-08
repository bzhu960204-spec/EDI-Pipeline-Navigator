import { useMemo, useState } from 'react';
import {
  App as AntApp,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Space,
  Spin,
  Tag,
  Timeline,
  Tree,
  Typography,
  Upload,
} from 'antd';
import type { UploadProps } from 'antd';
import type { DataNode } from 'antd/es/tree';
import {
  ArrowLeftOutlined,
  DeleteOutlined,
  DownloadOutlined,
  FileOutlined,
  FolderAddOutlined,
  FolderOutlined,
  InboxOutlined,
  SwapOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  advanceArtifact,
  createFolder,
  deleteArtifact,
  deleteNode,
  downloadNode,
  exportArtifact,
  fetchArtifact,
  fetchHistory,
  uploadFiles,
  type ArtifactNode,
} from '../../api/artifacts';
import { extractErrorMessage } from '../../api/client';
import { AdvanceStatusModal } from './AdvanceStatusModal';

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

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

  const treeData = useMemo(() => (artifact ? toTreeData(artifact.nodes) : []), [artifact]);
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
    mutationFn: (name: string) => createFolder(artifactId, { parentId: targetFolderId, name }),
    onSuccess: () => {
      message.success('Folder created');
      setFolderOpen(false);
      folderForm.resetFields();
      invalidate();
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to create folder')),
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

  if (isLoading) return <Spin />;
  if (!artifact) return <Empty description="Artifact not found" />;

  const targetFolderName = targetFolderId
    ? findNode(artifact.nodes, targetFolderId)?.name ?? 'root'
    : 'root (top level)';

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
          <Popconfirm title="Delete this artifact?" onConfirm={() => removeArtifact.mutate()}>
            <Button danger icon={<DeleteOutlined />}>
              Delete
            </Button>
          </Popconfirm>
        </Space>
      </Row>

      <Row gutter={16}>
        <Col xs={24} lg={14}>
          <Card
            title="Files"
            extra={
              <Space>
                <Button size="small" icon={<FolderAddOutlined />} onClick={() => setFolderOpen(true)}>
                  New folder
                </Button>
                <Upload {...uploadProps}>
                  <Button size="small" type="primary" icon={<UploadOutlined />}>
                    Upload
                  </Button>
                </Upload>
              </Space>
            }
          >
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Target folder: <b>{targetFolderName}</b> (select a folder to change)
            </Typography.Text>
            {treeData.length === 0 ? (
              <Empty description="Empty artifact — upload files or add folders" />
            ) : (
              <Tree
                showIcon
                showLine
                blockNode
                treeData={treeData}
                selectedKeys={selectedId != null ? [selectedId] : []}
                onSelect={(keys) => setSelectedId(keys.length ? Number(keys[0]) : null)}
                style={{ marginTop: 12 }}
              />
            )}

            <Upload.Dragger {...uploadProps} style={{ marginTop: 16 }}>
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">Drag files here to upload into “{targetFolderName}”</p>
            </Upload.Dragger>

            {selectedNode && (
              <Card size="small" style={{ marginTop: 16 }} title={selectedNode.name}>
                <Descriptions size="small" column={1}>
                  <Descriptions.Item label="Type">
                    {selectedNode.folder ? 'Folder' : selectedNode.contentType || 'File'}
                  </Descriptions.Item>
                  {!selectedNode.folder && (
                    <Descriptions.Item label="Size">{formatBytes(selectedNode.sizeBytes)}</Descriptions.Item>
                  )}
                </Descriptions>
                <Space>
                  {!selectedNode.folder && (
                    <Button size="small" icon={<DownloadOutlined />} onClick={() => handleDownload(selectedNode)}>
                      Download
                    </Button>
                  )}
                  <Popconfirm
                    title={selectedNode.folder ? 'Delete folder and its contents?' : 'Delete this file?'}
                    onConfirm={() => removeNode.mutate(selectedNode.id)}
                  >
                    <Button size="small" danger icon={<DeleteOutlined />}>
                      Delete
                    </Button>
                  </Popconfirm>
                </Space>
              </Card>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={10}>
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
      </Row>

      <AdvanceStatusModal
        open={advanceOpen}
        currentStepId={artifact.currentStepId}
        confirmLoading={advance.isPending}
        onCancel={() => setAdvanceOpen(false)}
        onSubmit={(values) => advance.mutate(values)}
      />

      <Modal
        open={folderOpen}
        title={`New folder in “${targetFolderName}”`}
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
    </div>
  );
}
