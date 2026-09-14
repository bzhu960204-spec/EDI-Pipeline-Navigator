import { useEffect, useState } from 'react';
import { App as AntApp, Alert, Empty, Input, Modal, Spin, Typography, Upload } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { analyzeVersionUpload, createVersion, type VersionDiff } from '../../api/artifacts';
import { extractErrorMessage } from '../../api/client';
import { VersionDiffView } from './VersionDiffView';

interface UploadVersionModalProps {
  open: boolean;
  artifactId: number;
  onCancel: () => void;
  onCreated: () => void;
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
          <VersionDiffView diff={diff} />
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
