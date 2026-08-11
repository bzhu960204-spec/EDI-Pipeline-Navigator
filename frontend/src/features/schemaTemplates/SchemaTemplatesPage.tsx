import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  List,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import {
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  FileAddOutlined,
  PlusOutlined,
  StarOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { extractErrorMessage } from '../../api/client';
import { isAdmin, useAuthStore } from '../auth/authStore';
import {
  createSchemaTemplate,
  createSchemaTemplateVersion,
  deleteSchemaTemplate,
  fetchSchemaTemplates,
  fetchSchemaTemplateVersions,
  setSchemaTemplateCurrent,
  updateSchemaTemplateMetadata,
  type SchemaTemplate,
  type SchemaTemplateSummary,
} from '../../api/schemaTemplates';

const { Text, Title, Paragraph } = Typography;

type CreateForm = { name: string; description?: string; version?: string; versionLabel?: string; content: string; changeNotes?: string };
type VersionForm = { version: string; versionLabel?: string; description?: string; content: string; changeNotes?: string };
type MetaForm = { name: string; version: string; description?: string; versionLabel?: string; content: string; changeNotes?: string };

export function SchemaTemplatesPage() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const admin = isAdmin(user);

  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [versionOpen, setVersionOpen] = useState(false);
  const [metaOpen, setMetaOpen] = useState(false);
  const [createForm] = Form.useForm<CreateForm>();
  const [versionForm] = Form.useForm<VersionForm>();
  const [metaForm] = Form.useForm<MetaForm>();

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['schema-templates'],
    queryFn: fetchSchemaTemplates,
  });

  // Keep a template selected as the list loads / changes.
  useEffect(() => {
    if (selectedGroupId == null && templates.length > 0) {
      setSelectedGroupId(templates[0].id);
    }
  }, [templates, selectedGroupId]);

  const { data: versions = [] } = useQuery({
    queryKey: ['schema-template-versions', selectedGroupId],
    queryFn: () => fetchSchemaTemplateVersions(selectedGroupId as number),
    enabled: selectedGroupId != null,
  });

  // Default the version viewer to the current version whenever the group changes.
  useEffect(() => {
    if (versions.length === 0) {
      setSelectedVersionId(null);
      return;
    }
    const current = versions.find((v) => v.isCurrent) ?? versions[versions.length - 1];
    setSelectedVersionId((prev) => (versions.some((v) => v.id === prev) ? prev : current.id));
  }, [versions]);

  const selected: SchemaTemplate | undefined = useMemo(
    () => versions.find((v) => v.id === selectedVersionId),
    [versions, selectedVersionId],
  );

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['schema-templates'] });
    queryClient.invalidateQueries({ queryKey: ['schema-template-versions'] });
  };

  const createMut = useMutation({
    mutationFn: (values: CreateForm) => createSchemaTemplate(values),
    onSuccess: (created) => {
      message.success('Template created');
      setCreateOpen(false);
      createForm.resetFields();
      setSelectedGroupId(created.id);
      invalidateAll();
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to create template')),
  });

  const versionMut = useMutation({
    mutationFn: (values: VersionForm) =>
      createSchemaTemplateVersion(selectedGroupId as number, values),
    onSuccess: (created) => {
      message.success(`Version ${created.version} published`);
      setVersionOpen(false);
      versionForm.resetFields();
      setSelectedVersionId(created.id);
      invalidateAll();
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to publish version')),
  });

  const metaMut = useMutation({
    mutationFn: (values: MetaForm) =>
      updateSchemaTemplateMetadata(selectedVersionId as number, values),
    onSuccess: () => {
      message.success('Details updated');
      setMetaOpen(false);
      invalidateAll();
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to update details')),
  });

  const setCurrentMut = useMutation({
    mutationFn: (id: number) => setSchemaTemplateCurrent(id),
    onSuccess: () => {
      message.success('Current version updated');
      invalidateAll();
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to set current version')),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteSchemaTemplate(id),
    onSuccess: () => {
      message.success('Version deleted');
      // If we removed the last version of the selected group, drop the selection.
      if (versions.length <= 1) setSelectedGroupId(null);
      invalidateAll();
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to delete version')),
  });

  const openCreate = () => {
    createForm.resetFields();
    createForm.setFieldsValue({ version: '1.0' });
    setCreateOpen(true);
  };

  const openVersion = () => {
    versionForm.resetFields();
    versionForm.setFieldsValue({
      content: selected?.content ?? '',
      description: selected?.description ?? undefined,
    });
    setVersionOpen(true);
  };

  const openMeta = () => {
    if (!selected) return;
    metaForm.setFieldsValue({
      name: selected.name,
      version: selected.version,
      description: selected.description ?? undefined,
      versionLabel: selected.versionLabel ?? undefined,
      content: selected.content,
      changeNotes: selected.changeNotes ?? undefined,
    });
    setMetaOpen(true);
  };

  const copy = async (textToCopy: string, label: string) => {
    try {
      await navigator.clipboard.writeText(textToCopy);
      message.success(`${label} copied`);
    } catch {
      message.error('Clipboard not available');
    }
  };

  return (
    <div>
      <Space align="center" style={{ justifyContent: 'space-between', width: '100%', marginBottom: 16 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>Schema Templates</Title>
          <Text type="secondary">Versioned JSON skeletons — the single source of truth for import schemas.</Text>
        </div>
        {admin && (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            New template
          </Button>
        )}
      </Space>

      <Row gutter={16}>
        <Col xs={24} md={8} lg={7}>
          <Card size="small" loading={isLoading} styles={{ body: { padding: 0 } }}>
            <List
              dataSource={templates}
              locale={{ emptyText: <Empty description="No templates yet" /> }}
              renderItem={(t: SchemaTemplateSummary) => (
                <List.Item
                  onClick={() => setSelectedGroupId(t.id)}
                  style={{
                    cursor: 'pointer',
                    padding: '10px 16px',
                    background: t.id === selectedGroupId ? 'rgba(22,119,255,0.08)' : undefined,
                  }}
                >
                  <List.Item.Meta
                    title={
                      <Space size={6}>
                        <span>{t.name}</span>
                        <Tag color="blue">v{t.version}</Tag>
                        {t.versionCount > 1 && <Tag>{t.versionCount} versions</Tag>}
                      </Space>
                    }
                    description={t.description}
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>

        <Col xs={24} md={16} lg={17}>
          {!selected ? (
            <Card>
              <Empty description="Select a template to view its versions" />
            </Card>
          ) : (
            <Card
              title={
                <Space wrap>
                  <span>{selected.name}</span>
                  <Select
                    size="small"
                    style={{ minWidth: 220 }}
                    value={selectedVersionId ?? undefined}
                    onChange={setSelectedVersionId}
                    options={versions
                      .slice()
                      .reverse()
                      .map((v) => ({
                        value: v.id,
                        label: `v${v.version}${v.isCurrent ? ' (current)' : ''}${v.versionLabel ? ` — ${v.versionLabel}` : ''}`,
                      }))}
                  />
                  {selected.isCurrent && <Tag color="green">current</Tag>}
                </Space>
              }
              extra={
                admin && (
                  <Space>
                    <Tooltip title="Publish a new version">
                      <Button size="small" icon={<FileAddOutlined />} onClick={openVersion}>
                        New version
                      </Button>
                    </Tooltip>
                    {!selected.isCurrent && (
                      <Tooltip title="Make this the current version">
                        <Button
                          size="small"
                          icon={<StarOutlined />}
                          loading={setCurrentMut.isPending}
                          onClick={() => setCurrentMut.mutate(selected.id)}
                        >
                          Set current
                        </Button>
                      </Tooltip>
                    )}
                    <Button size="small" icon={<EditOutlined />} onClick={openMeta}>
                      Edit
                    </Button>
                    <Popconfirm
                      title="Delete this version?"
                      description="This version's snapshot will be removed permanently."
                      okButtonProps={{ danger: true }}
                      onConfirm={() => deleteMut.mutate(selected.id)}
                    >
                      <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  </Space>
                )
              }
            >
              {selected.description && <Paragraph type="secondary">{selected.description}</Paragraph>}

              <Space size={16} wrap style={{ marginBottom: 12 }}>
                <Text type="secondary">
                  Published {new Date(selected.createdAt).toLocaleString()}
                  {selected.createdBy ? ` by ${selected.createdBy}` : ''}
                </Text>
                {selected.updatedAt && (
                  <Text type="secondary">
                    · Edited {new Date(selected.updatedAt).toLocaleString()}
                    {selected.updatedBy ? ` by ${selected.updatedBy}` : ''}
                  </Text>
                )}
                {selected.contentValid ? (
                  <Tag color="green">Valid against import schema</Tag>
                ) : (
                  <Tag color="orange">Schema mismatch</Tag>
                )}
              </Space>

              {!selected.contentValid && selected.contentError && (
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginBottom: 12 }}
                  message="Content does not fully match the import schema"
                  description={selected.contentError}
                />
              )}

              {selected.changeNotes && (
                <Alert
                  type="info"
                  showIcon
                  style={{ marginBottom: 12 }}
                  message="Change notes"
                  description={selected.changeNotes}
                />
              )}

              <Space style={{ marginBottom: 8 }}>
                <Button size="small" icon={<CopyOutlined />} onClick={() => copy(selected.content, 'JSON')}>
                  Copy JSON
                </Button>
                <Button
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={() => copy('```jsonc\n' + selected.content.trim() + '\n```', 'README block')}
                >
                  Copy as README block
                </Button>
              </Space>

              <pre style={styles.code}>{selected.content}</pre>
            </Card>
          )}
        </Col>
      </Row>

      <Modal
        title="New template"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => createForm.submit()}
        confirmLoading={createMut.isPending}
        okText="Create"
        width={720}
      >
        <Form form={createForm} layout="vertical" onFinish={(v) => createMut.mutate(v)}>
          <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Name is required' }]}>
            <Input placeholder="e.g. Sub-Workflow Import Skeleton" />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Space style={{ display: 'flex' }} align="start">
            <Form.Item name="version" label="Version" rules={[{ required: true }]}>
              <Input placeholder="1.0" style={{ width: 120 }} />
            </Form.Item>
            <Form.Item name="versionLabel" label="Version label" style={{ flex: 1 }}>
              <Input placeholder="e.g. Initial skeleton" />
            </Form.Item>
          </Space>
          <Form.Item name="content" label="JSON content" rules={[{ required: true, message: 'Content is required' }]}>
            <Input.TextArea rows={14} style={{ fontFamily: 'monospace' }} />
          </Form.Item>
          <Form.Item name="changeNotes" label="Change notes">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Publish new version"
        open={versionOpen}
        onCancel={() => setVersionOpen(false)}
        onOk={() => versionForm.submit()}
        confirmLoading={versionMut.isPending}
        okText="Publish"
        width={720}
      >
        <Form form={versionForm} layout="vertical" onFinish={(v) => versionMut.mutate(v)}>
          <Space style={{ display: 'flex' }} align="start">
            <Form.Item name="version" label="Version" rules={[{ required: true, message: 'Version is required' }]}>
              <Input placeholder="1.1" style={{ width: 120 }} />
            </Form.Item>
            <Form.Item name="versionLabel" label="Version label" style={{ flex: 1 }}>
              <Input placeholder="What changed in a few words" />
            </Form.Item>
          </Space>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="content" label="JSON content" rules={[{ required: true, message: 'Content is required' }]}>
            <Input.TextArea rows={16} style={{ fontFamily: 'monospace' }} />
          </Form.Item>
          <Form.Item name="changeNotes" label="Change notes">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Edit version"
        open={metaOpen}
        onCancel={() => setMetaOpen(false)}
        onOk={() => metaForm.submit()}
        confirmLoading={metaMut.isPending}
        okText="Save"
        width={720}
      >
        <Form form={metaForm} layout="vertical" onFinish={(v) => metaMut.mutate(v)}>
          <Form.Item name="name" label="Name (applies to all versions)" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Space style={{ display: 'flex' }} align="start">
            <Form.Item name="version" label="Version" rules={[{ required: true, message: 'Version is required' }]}>
              <Input style={{ width: 120 }} />
            </Form.Item>
            <Form.Item name="versionLabel" label="Version label" style={{ flex: 1 }}>
              <Input />
            </Form.Item>
          </Space>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="content" label="JSON content" rules={[{ required: true, message: 'Content is required' }]}>
            <Input.TextArea rows={16} style={{ fontFamily: 'monospace' }} />
          </Form.Item>
          <Form.Item name="changeNotes" label="Change notes">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  code: {
    margin: 0,
    padding: 12,
    borderRadius: 6,
    background: 'rgba(0,0,0,0.04)',
    border: '1px solid rgba(0,0,0,0.08)',
    overflow: 'auto',
    maxHeight: 480,
    fontSize: 12,
    lineHeight: 1.5,
  },
};
