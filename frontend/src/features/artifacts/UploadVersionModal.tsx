import { useEffect, useMemo, useState, type Key } from 'react';
import { App as AntApp, Alert, Empty, Input, Modal, Space, Spin, Switch, Tag, Tree, Typography, Upload } from 'antd';
import { InboxOutlined, FileOutlined, FolderOutlined, CheckOutlined } from '@ant-design/icons';
import type { DataNode } from 'antd/es/tree';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  analyzeVersionUpload,
  createVersion,
  type DiffEntry,
  type VersionDiff,
} from '../../api/artifacts';
import { extractErrorMessage } from '../../api/client';

interface UploadVersionModalProps {
  open: boolean;
  artifactId: number;
  onCancel: () => void;
  onCreated: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type DiffStatus = 'added' | 'modified' | 'deleted' | 'unchanged';

const STATUS_META: Record<DiffStatus, { color: string; label: string }> = {
  added: { color: 'green', label: 'Added' },
  modified: { color: 'orange', label: 'Modified' },
  deleted: { color: 'red', label: 'Deleted' },
  unchanged: { color: 'default', label: 'Unchanged' },
};

/** Statuses exposed as clickable filter chips. `unchanged` is controlled by its own toggle instead. */
const CHANGE_STATUSES: DiffStatus[] = ['added', 'modified', 'deleted'];

function toggleStatus(prev: Set<DiffStatus>, status: DiffStatus): Set<DiffStatus> {
  const next = new Set(prev);
  if (next.has(status)) next.delete(status);
  else next.add(status);
  return next;
}

interface DiffFile {
  path: string;
  name: string;
  status: DiffStatus;
  sizeBytes: number;
  oldSizeBytes: number;
}

interface DiffTreeNode {
  name: string;
  path: string;
  children: Map<string, DiffTreeNode>;
  counts: Record<DiffStatus, number>;
  file?: DiffFile;
}

function emptyCounts(): Record<DiffStatus, number> {
  return { added: 0, modified: 0, deleted: 0, unchanged: 0 };
}

/** Folds the four flat diff lists into a single path-keyed folder/file tree. */
function buildDiffTree(diff: VersionDiff): DiffTreeNode {
  const root: DiffTreeNode = { name: '', path: '', children: new Map(), counts: emptyCounts() };
  const addEntry = (entry: DiffEntry, status: DiffStatus) => {
    const segments = entry.path.split('/').filter(Boolean);
    let node = root;
    segments.forEach((seg, idx) => {
      const isLeaf = idx === segments.length - 1;
      let child = node.children.get(seg);
      if (!child) {
        child = {
          name: seg,
          path: segments.slice(0, idx + 1).join('/'),
          children: new Map(),
          counts: emptyCounts(),
        };
        node.children.set(seg, child);
      }
      child.counts[status] += 1;
      if (isLeaf) {
        child.file = {
          path: entry.path,
          name: entry.name,
          status,
          sizeBytes: entry.sizeBytes,
          oldSizeBytes: entry.oldSizeBytes,
        };
      }
      node = child;
    });
  };
  diff.added.forEach((e) => addEntry(e, 'added'));
  diff.modified.forEach((e) => addEntry(e, 'modified'));
  diff.deleted.forEach((e) => addEntry(e, 'deleted'));
  diff.unchanged.forEach((e) => addEntry(e, 'unchanged'));
  return root;
}

function fileTitle(file: DiffFile) {
  const meta = STATUS_META[file.status];
  const greyed = file.status === 'unchanged';
  return (
    <Space size={6} style={{ width: '100%', justifyContent: 'space-between', opacity: greyed ? 0.55 : 1 }}>
      <span title={file.path}>
        <FileOutlined style={{ marginInlineEnd: 6 }} />
        <b>{file.name}</b>
      </span>
      <Space size={6}>
        {file.status === 'unchanged' ? null : <Tag color={meta.color}>{meta.label}</Tag>}
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {file.status === 'modified' && file.oldSizeBytes > 0 ? `${formatBytes(file.oldSizeBytes)} → ` : ''}
          {formatBytes(file.sizeBytes)}
        </Typography.Text>
      </Space>
    </Space>
  );
}

function folderTitle(node: DiffTreeNode) {
  const { counts } = node;
  return (
    <Space size={4}>
      <FolderOutlined />
      <span>{node.name}</span>
      {counts.added > 0 ? <Tag color="green">{counts.added}</Tag> : null}
      {counts.modified > 0 ? <Tag color="orange">{counts.modified}</Tag> : null}
      {counts.deleted > 0 ? <Tag color="red">{counts.deleted}</Tag> : null}
    </Space>
  );
}

/** A file is visible when its status passes the active chip filter (empty = all changes) and, for unchanged, the toggle. */
function fileVisible(file: DiffFile, active: Set<DiffStatus>, showUnchanged: boolean): boolean {
  if (file.status === 'unchanged') return showUnchanged;
  return active.size === 0 || active.has(file.status);
}

function childToDataNode(child: DiffTreeNode, active: Set<DiffStatus>, showUnchanged: boolean): DataNode | null {
  if (child.children.size === 0 && child.file) {
    return fileVisible(child.file, active, showUnchanged)
      ? { key: `f:${child.path}`, title: fileTitle(child.file), selectable: false }
      : null;
  }
  const grandChildren = toDataNodes(child, active, showUnchanged);
  if (grandChildren.length === 0) return null;
  return { key: `d:${child.path}`, title: folderTitle(child), selectable: false, children: grandChildren };
}

function toDataNodes(node: DiffTreeNode, active: Set<DiffStatus>, showUnchanged: boolean): DataNode[] {
  const children = [...node.children.values()].sort((a, b) => {
    const aFolder = a.children.size > 0;
    const bFolder = b.children.size > 0;
    if (aFolder !== bFolder) return aFolder ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
  return children
    .map((child) => childToDataNode(child, active, showUnchanged))
    .filter((n): n is DataNode => n !== null);
}

function collectFolderKeys(nodes: DataNode[], acc: Key[]): void {
  for (const n of nodes) {
    if (n.children && n.children.length > 0) {
      acc.push(n.key);
      collectFolderKeys(n.children, acc);
    }
  }
}

export function UploadVersionModal({ open, artifactId, onCancel, onCreated }: Readonly<UploadVersionModalProps>) {
  const { message } = AntApp.useApp();
  const queryClient = useQueryClient();
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [diff, setDiff] = useState<VersionDiff | null>(null);
  const [comment, setComment] = useState('');
  const [showUnchanged, setShowUnchanged] = useState(false);
  const [activeStatuses, setActiveStatuses] = useState<Set<DiffStatus>>(new Set());
  const [expandedKeys, setExpandedKeys] = useState<Key[]>([]);

  useEffect(() => {
    if (open) {
      setAnalyzing(false);
      setAnalyzeError(null);
      setDiff(null);
      setComment('');
      setShowUnchanged(false);
      setActiveStatuses(new Set());
    }
  }, [open]);

  const treeData = useMemo(
    () => (diff ? toDataNodes(buildDiffTree(diff), activeStatuses, showUnchanged) : []),
    [diff, activeStatuses, showUnchanged],
  );

  useEffect(() => {
    const keys: Key[] = [];
    collectFolderKeys(treeData, keys);
    setExpandedKeys(keys);
  }, [treeData]);

  const handleFile = async (file: File) => {
    setAnalyzing(true);
    setAnalyzeError(null);
    try {
      const result = await analyzeVersionUpload(artifactId, file);
      setDiff(result);
    } catch (e) {
      setAnalyzeError(extractErrorMessage(e, 'Failed to read the archive'));
      setDiff(null);
    } finally {
      setAnalyzing(false);
    }
  };

  const create = useMutation({
    mutationFn: () => createVersion(artifactId, { token: diff!.token, comment: comment.trim() || undefined }),
    onSuccess: () => {
      message.success('New version created');
      queryClient.invalidateQueries({ queryKey: ['artifacts', artifactId] });
      queryClient.invalidateQueries({ queryKey: ['artifacts', artifactId, 'versions'] });
      queryClient.invalidateQueries({ queryKey: ['artifacts'] });
      onCreated();
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to create version')),
  });

  const noChanges =
    diff != null && diff.addedCount === 0 && diff.modifiedCount === 0 && diff.deletedCount === 0;

  return (
    <Modal
      open={open}
      title="Upload new version"
      width={640}
      okText="Create version"
      okButtonProps={{ disabled: diff == null || analyzing }}
      confirmLoading={create.isPending}
      onCancel={onCancel}
      onOk={() => create.mutate()}
      destroyOnClose
      maskClosable={false}
    >
      <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
        Upload the complete updated directory as a <b>.zip</b>. Files not present in the archive are treated as
        deleted; same-path files keep their checklist assignment.
      </Typography.Paragraph>

      <Upload.Dragger
        accept=".zip"
        multiple={false}
        maxCount={1}
        showUploadList={false}
        beforeUpload={(file) => {
          void handleFile(file as unknown as File);
          return false;
        }}
      >
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p className="ant-upload-text">Click or drag a .zip archive here</p>
      </Upload.Dragger>

      {analyzing ? (
        <div style={{ textAlign: 'center', padding: 16 }}>
          <Spin /> <Typography.Text type="secondary">Reading archive…</Typography.Text>
        </div>
      ) : null}
      {analyzeError ? <Alert type="error" showIcon style={{ marginTop: 12 }} message={analyzeError} /> : null}

      {diff ? (
        <div style={{ marginTop: 16 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 8,
              marginBottom: 12,
            }}
          >
            <Space wrap>
              {CHANGE_STATUSES.map((status) => {
                const meta = STATUS_META[status];
                const counts: Record<string, number> = {
                  added: diff.addedCount,
                  modified: diff.modifiedCount,
                  deleted: diff.deletedCount,
                };
                const count = counts[status];
                const selected = activeStatuses.has(status);
                return (
                  <Tag
                    key={status}
                    color={meta.color}
                    icon={selected ? <CheckOutlined /> : undefined}
                    onClick={() => setActiveStatuses((prev) => toggleStatus(prev, status))}
                    style={{
                      cursor: 'pointer',
                      userSelect: 'none',
                      fontWeight: selected ? 600 : 400,
                      boxShadow: selected ? '0 0 0 1px currentColor inset' : undefined,
                    }}
                  >
                    {count} {status}
                  </Tag>
                );
              })}
              <Tag>{diff.unchangedCount} unchanged</Tag>
            </Space>
            <Space size={6}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Show unchanged
              </Typography.Text>
              <Switch size="small" checked={showUnchanged} onChange={setShowUnchanged} />
            </Space>
          </div>
          {treeData.length === 0 ? (
            <Alert
              type="info"
              showIcon
              message={
                noChanges && activeStatuses.size === 0
                  ? 'No file changes detected in this upload.'
                  : 'No files match the current filter.'
              }
            />
          ) : (
            <Tree
              treeData={treeData}
              selectable={false}
              showIcon={false}
              height={260}
              expandedKeys={expandedKeys}
              onExpand={(keys) => setExpandedKeys(keys)}
              style={{ marginBottom: 12 }}
            />
          )}
          <Typography.Text strong>Version comment</Typography.Text>
          <Input.TextArea
            rows={3}
            maxLength={500}
            showCount
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Describe what changed in this version"
            style={{ marginTop: 6 }}
          />
        </div>
      ) : (
        !analyzing && !analyzeError && (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="Upload a .zip to preview changes"
            style={{ marginTop: 16 }}
          />
        )
      )}
    </Modal>
  );
}
