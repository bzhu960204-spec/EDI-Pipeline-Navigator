import { useEffect, useState } from 'react';
import { App as AntApp, Alert, Empty, Input, List, Modal, Space, Spin, Tag, Typography, Upload } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
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

function DiffList({ title, color, entries, showOld }: Readonly<{
  title: string;
  color: string;
  entries: DiffEntry[];
  showOld?: boolean;
}>) {
  if (entries.length === 0) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <Space style={{ marginBottom: 4 }}>
        <Tag color={color}>{title}</Tag>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {entries.length} file{entries.length === 1 ? '' : 's'}
        </Typography.Text>
      </Space>
      <List
        size="small"
        bordered
        dataSource={entries}
        style={{ maxHeight: 160, overflow: 'auto' }}
        renderItem={(e) => (
          <List.Item>
            <Space size={6} style={{ width: '100%', justifyContent: 'space-between' }}>
              <span title={e.path}>
                {e.folder ? `${e.folder}/` : ''}
                <b>{e.name}</b>
              </span>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {showOld && e.oldSizeBytes > 0 ? `${formatBytes(e.oldSizeBytes)} → ` : ''}
                {formatBytes(e.sizeBytes)}
              </Typography.Text>
            </Space>
          </List.Item>
        )}
      />
    </div>
  );
}

export function UploadVersionModal({ open, artifactId, onCancel, onCreated }: Readonly<UploadVersionModalProps>) {
  const { message } = AntApp.useApp();
  const queryClient = useQueryClient();
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [diff, setDiff] = useState<VersionDiff | null>(null);
  const [comment, setComment] = useState('');

  useEffect(() => {
    if (open) {
      setAnalyzing(false);
      setAnalyzeError(null);
      setDiff(null);
      setComment('');
    }
  }, [open]);

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
          <Space style={{ marginBottom: 12 }} wrap>
            <Tag color="green">{diff.addedCount} added</Tag>
            <Tag color="orange">{diff.modifiedCount} modified</Tag>
            <Tag color="red">{diff.deletedCount} deleted</Tag>
            <Tag>{diff.unchangedCount} unchanged</Tag>
          </Space>
          {noChanges ? (
            <Alert type="info" showIcon message="No file changes detected in this upload." />
          ) : (
            <>
              <DiffList title="Added" color="green" entries={diff.added} />
              <DiffList title="Modified" color="orange" entries={diff.modified} showOld />
              <DiffList title="Deleted" color="red" entries={diff.deleted} />
            </>
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
