import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App as AntApp, Button, Card, Empty, Input, Modal, Popconfirm, Space, Spin, Typography } from 'antd';
import {
  ArrowLeftOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  createLog,
  deleteLog,
  fetchLogs,
  updateLog,
  type LogEntry,
} from '../../api/logs';
import { extractErrorMessage } from '../../api/client';
import { ExportLogsModal } from './ExportLogsModal';

type View =
  | { kind: 'list' }
  | { kind: 'read'; log: LogEntry };

// null = new log; when non-null the modal is open editing that (or a new) log.
type Editing = { log: LogEntry | null } | null;

interface LogsPanelProps {
  artifactId: number;
  /** Title shown on the exported HTML cover. */
  exportTitle: string;
}

export function LogsPanel({ artifactId, exportTitle }: LogsPanelProps) {
  const { message } = AntApp.useApp();
  const [view, setView] = useState<View>({ kind: 'list' });
  const [editing, setEditing] = useState<Editing>(null);
  const [showExport, setShowExport] = useState(false);
  const queryClient = useQueryClient();

  const cacheKey = ['artifacts', artifactId, 'logs'];

  const { data: logs = [], isLoading } = useQuery({
    queryKey: cacheKey,
    queryFn: () => fetchLogs(artifactId),
    enabled: Number.isFinite(artifactId),
  });

  const createMutation = useMutation({
    mutationFn: (input: { title: string; content: string }) => createLog(artifactId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cacheKey });
      setEditing(null);
      setView({ kind: 'list' });
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to create log')),
  });

  const updateMutation = useMutation({
    mutationFn: ({ logId, input }: { logId: number; input: { title: string; content: string } }) =>
      updateLog(artifactId, logId, input),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: cacheKey });
      setEditing(null);
      setView({ kind: 'read', log: updated });
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to update log')),
  });

  const deleteMutation = useMutation({
    mutationFn: (logId: number) => deleteLog(artifactId, logId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cacheKey });
      setView({ kind: 'list' });
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to delete log')),
  });

  const editor = (
    <LogEditor
      editing={editing}
      onClose={() => setEditing(null)}
      createMutation={createMutation}
      updateMutation={updateMutation}
    />
  );

  if (view.kind === 'read') {
    const { log } = view;
    return (
      <Card
        title={
          <Space>
            <Button
              type="text"
              size="small"
              icon={<ArrowLeftOutlined />}
              onClick={() => setView({ kind: 'list' })}
            />
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{log.title}</span>
          </Space>
        }
        extra={
          <Space>
            <Button size="small" icon={<EditOutlined />} onClick={() => setEditing({ log })} />
            <Popconfirm
              title="Delete this log?"
              okText="Delete"
              okButtonProps={{ danger: true, loading: deleteMutation.isPending }}
              onConfirm={() => deleteMutation.mutate(log.id)}
            >
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        }
      >
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Updated {dayjs(log.updatedAt).format('MMM D, YYYY HH:mm')}
        </Typography.Text>
        <Typography.Paragraph style={{ marginTop: 12, whiteSpace: 'pre-wrap' }}>
          {log.content?.trim() ? (
            log.content
          ) : (
            <Typography.Text type="secondary" italic>
              No content
            </Typography.Text>
          )}
        </Typography.Paragraph>
        {editor}
      </Card>
    );
  }

  return (
    <Card
      title={`Logs (${logs.length})`}
      extra={
        <Space>
          {logs.length > 0 && (
            <Button size="small" icon={<DownloadOutlined />} onClick={() => setShowExport(true)}>
              Export
            </Button>
          )}
          <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => setEditing({ log: null })}>
            New
          </Button>
        </Space>
      }
    >
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 16 }}>
          <Spin />
        </div>
      ) : logs.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No logs yet" />
      ) : (
        <Space direction="vertical" size={4} style={{ display: 'flex' }}>
          {logs.map((log) => (
            <button
              key={log.id}
              type="button"
              onClick={() => setView({ kind: 'read', log })}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                border: '1px solid #f0f0f0',
                borderRadius: 6,
                padding: '8px 12px',
                background: 'transparent',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {log.title}
              </div>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {dayjs(log.updatedAt).format('MMM D, YYYY HH:mm')}
              </Typography.Text>
            </button>
          ))}
        </Space>
      )}

      <ExportLogsModal
        open={showExport}
        onClose={() => setShowExport(false)}
        items={logs}
        documentTitle={exportTitle}
      />
      {editor}
    </Card>
  );
}

function LogEditor({
  editing,
  onClose,
  createMutation,
  updateMutation,
}: {
  editing: Editing;
  onClose: () => void;
  createMutation: ReturnType<typeof useMutation<LogEntry, Error, { title: string; content: string }>>;
  updateMutation: ReturnType<
    typeof useMutation<LogEntry, Error, { logId: number; input: { title: string; content: string } }>
  >;
}) {
  const open = editing !== null;
  const isNew = editing?.log == null;
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  // Sync the form fields whenever the modal opens for a (different) log.
  useEffect(() => {
    if (editing) {
      setTitle(editing.log?.title ?? '');
      setContent(editing.log?.content ?? '');
    }
  }, [editing]);

  function handleSave() {
    if (!title.trim()) return;
    if (isNew) {
      createMutation.mutate({ title: title.trim(), content });
    } else {
      updateMutation.mutate({ logId: editing!.log!.id, input: { title: title.trim(), content } });
    }
  }

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <Modal
      open={open}
      centered
      width={640}
      title={isNew ? 'New log' : 'Edit log'}
      okText="Save"
      okButtonProps={{ loading: saving, disabled: !title.trim() }}
      cancelButtonProps={{ disabled: saving }}
      onOk={handleSave}
      onCancel={onClose}
      maskClosable={!saving}
      destroyOnClose
    >
      <Space direction="vertical" size={12} style={{ display: 'flex' }}>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Log title"
          maxLength={200}
        />
        <Input.TextArea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Write your log content here..."
          autoSize={{ minRows: 10, maxRows: 24 }}
        />
      </Space>
    </Modal>
  );
}
