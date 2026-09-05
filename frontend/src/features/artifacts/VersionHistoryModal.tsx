import { App as AntApp, Button, Empty, List, Modal, Popconfirm, Space, Spin, Tag, Tooltip, Typography } from 'antd';
import { DeleteOutlined, DownloadOutlined, EyeOutlined, RollbackOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  deleteVersion,
  exportVersion,
  fetchVersions,
  setCurrentVersion,
  type ArtifactVersion,
} from '../../api/artifacts';
import { extractErrorMessage } from '../../api/client';

interface VersionHistoryModalProps {
  open: boolean;
  artifactId: number;
  artifactName: string;
  viewingVersionId: number | null;
  onCancel: () => void;
  onView: (version: ArtifactVersion | null) => void;
}

export function VersionHistoryModal({
  open,
  artifactId,
  artifactName,
  viewingVersionId,
  onCancel,
  onView,
}: Readonly<VersionHistoryModalProps>) {
  const { message } = AntApp.useApp();
  const queryClient = useQueryClient();

  const { data: versions = [], isLoading } = useQuery({
    queryKey: ['artifacts', artifactId, 'versions'],
    queryFn: () => fetchVersions(artifactId),
    enabled: open,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['artifacts', artifactId] });
    queryClient.invalidateQueries({ queryKey: ['artifacts', artifactId, 'versions'] });
    queryClient.invalidateQueries({ queryKey: ['artifacts'] });
  };

  const rollback = useMutation({
    mutationFn: (versionId: number) => setCurrentVersion(artifactId, versionId),
    onSuccess: () => {
      message.success('Current version updated');
      onView(null);
      invalidate();
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to set current version')),
  });

  const remove = useMutation({
    mutationFn: (versionId: number) => deleteVersion(artifactId, versionId),
    onSuccess: (_data, versionId) => {
      message.success('Version deleted');
      if (viewingVersionId === versionId) onView(null);
      invalidate();
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to delete version')),
  });

  const download = async (v: ArtifactVersion) => {
    try {
      const safe = artifactName.replace(/[\\/:*?"<>|]/g, '_');
      await exportVersion(artifactId, v.id, `${safe}-v${v.versionNumber}.zip`);
    } catch (e) {
      message.error(extractErrorMessage(e, 'Download failed'));
    }
  };

  return (
    <Modal open={open} title="Version history" width={640} footer={null} onCancel={onCancel} destroyOnClose>
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 24 }}>
          <Spin />
        </div>
      ) : versions.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No versions" />
      ) : (
        <List
          dataSource={versions}
          renderItem={(v) => {
            const isViewing = viewingVersionId === v.id || (viewingVersionId == null && v.current);
            return (
              <List.Item
                actions={[
                  <Tooltip key="view" title={v.current ? 'View current version' : 'View this version'}>
                    <Button
                      type={isViewing ? 'primary' : 'text'}
                      size="small"
                      icon={<EyeOutlined />}
                      onClick={() => onView(v.current ? null : v)}
                    />
                  </Tooltip>,
                  <Tooltip key="download" title="Download ZIP">
                    <Button type="text" size="small" icon={<DownloadOutlined />} onClick={() => download(v)} />
                  </Tooltip>,
                  v.current ? (
                    <span key="current" />
                  ) : (
                    <Popconfirm
                      key="rollback"
                      title="Make this the current version?"
                      onConfirm={() => rollback.mutate(v.id)}
                    >
                      <Tooltip title="Set as current (rollback)">
                        <Button type="text" size="small" icon={<RollbackOutlined />} />
                      </Tooltip>
                    </Popconfirm>
                  ),
                  v.current ? (
                    <span key="delete" />
                  ) : (
                    <Popconfirm key="delete" title="Delete this version?" onConfirm={() => remove.mutate(v.id)}>
                      <Tooltip title="Delete version">
                        <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                      </Tooltip>
                    </Popconfirm>
                  ),
                ]}
              >
                <List.Item.Meta
                  title={
                    <Space>
                      <span>v{v.versionNumber}</span>
                      {v.current && <Tag color="blue">current</Tag>}
                    </Space>
                  }
                  description={
                    <Space direction="vertical" size={0}>
                      {v.comment && <Typography.Text>{v.comment}</Typography.Text>}
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {v.createdByName ?? `User #${v.createdBy}`} · {dayjs(v.createdAt).format('YYYY-MM-DD HH:mm')}
                      </Typography.Text>
                    </Space>
                  }
                />
              </List.Item>
            );
          }}
        />
      )}
    </Modal>
  );
}
