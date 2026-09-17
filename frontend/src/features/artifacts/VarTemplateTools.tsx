import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  App as AntApp,
  Button,
  Dropdown,
  Empty,
  Input,
  List,
  Modal,
  Popconfirm,
  Radio,
  Select,
  Space,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
  ImportOutlined,
  PlusOutlined,
  SaveOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import {
  applyVarTemplate,
  createVarTableTemplate,
  deleteVarTableTemplate,
  fetchVarTableTemplate,
  fetchVarTableTemplates,
  saveArtifactAsVarTemplate,
  saveVarTableAsTemplate,
  updateVarTableTemplate,
  type ApplyTemplateMode,
  type VarTableTemplatePayload,
} from '../../api/varTableTemplates';
import { extractErrorMessage } from '../../api/client';

interface VarTemplateToolsProps {
  artifactId: number;
  activeTableId: number | null;
  activeTableName?: string;
  hasTables: boolean;
  disabled?: boolean;
}

interface EditTab {
  name: string;
  keysText: string;
}

const TEMPLATES_KEY = ['var-table-templates'];

export function VarTemplateTools({
  artifactId,
  activeTableId,
  activeTableName,
  hasTables,
  disabled,
}: Readonly<VarTemplateToolsProps>) {
  const { message } = AntApp.useApp();
  const queryClient = useQueryClient();

  const [importOpen, setImportOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [importMode, setImportMode] = useState<ApplyTemplateMode>('MERGE');

  const [saveOpen, setSaveOpen] = useState(false);
  const [saveScope, setSaveScope] = useState<'current' | 'all'>('all');
  const [saveName, setSaveName] = useState('');
  const [saveDescription, setSaveDescription] = useState('');

  const [manageOpen, setManageOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editTabs, setEditTabs] = useState<EditTab[]>([]);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: TEMPLATES_KEY,
    queryFn: fetchVarTableTemplates,
  });

  const invalidateVars = () =>
    queryClient.invalidateQueries({ queryKey: ['artifacts', artifactId, 'var-tables'] });
  const invalidateTemplates = () => queryClient.invalidateQueries({ queryKey: TEMPLATES_KEY });

  const selectedPreview = useQuery({
    queryKey: ['var-table-templates', selectedTemplateId],
    queryFn: () => fetchVarTableTemplate(selectedTemplateId as number),
    enabled: importOpen && selectedTemplateId !== null,
  });

  const runApply = useMutation({
    mutationFn: () => applyVarTemplate(artifactId, selectedTemplateId as number, importMode),
    onSuccess: () => {
      message.success('Template applied');
      invalidateVars();
      setImportOpen(false);
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to apply template')),
  });

  const runSave = useMutation({
    mutationFn: () => {
      const payload = { name: saveName.trim(), description: saveDescription.trim() || null };
      return saveScope === 'current' && activeTableId != null
        ? saveVarTableAsTemplate(artifactId, activeTableId, payload)
        : saveArtifactAsVarTemplate(artifactId, payload);
    },
    onSuccess: (saved) => {
      message.success(`Saved template "${saved.name}"`);
      invalidateTemplates();
      setSaveOpen(false);
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to save template')),
  });

  const removeTemplate = useMutation({
    mutationFn: (id: number) => deleteVarTableTemplate(id),
    onSuccess: () => {
      message.success('Template deleted');
      invalidateTemplates();
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to delete template')),
  });

  const saveEditor = useMutation({
    mutationFn: () => {
      const payload: VarTableTemplatePayload = {
        name: editName.trim(),
        description: editDescription.trim() || null,
        tabs: editTabs
          .filter((t) => t.name.trim())
          .map((t) => ({
            name: t.name.trim(),
            keys: t.keysText
              .split('\n')
              .map((k) => k.trim())
              .filter(Boolean),
          })),
      };
      return editingId == null
        ? createVarTableTemplate(payload)
        : updateVarTableTemplate(editingId, payload);
    },
    onSuccess: () => {
      message.success('Template saved');
      invalidateTemplates();
      setEditorOpen(false);
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to save template')),
  });

  const openImport = () => {
    setSelectedTemplateId(templates[0]?.id ?? null);
    setImportMode('MERGE');
    setImportOpen(true);
  };

  const openSave = (scope: 'current' | 'all') => {
    setSaveScope(scope);
    setSaveName('');
    setSaveDescription('');
    setSaveOpen(true);
  };

  const openEditorForNew = () => {
    setEditingId(null);
    setEditName('');
    setEditDescription('');
    setEditTabs([{ name: '', keysText: '' }]);
    setEditorOpen(true);
  };

  const openEditorFor = async (id: number) => {
    try {
      const tpl = await fetchVarTableTemplate(id);
      setEditingId(tpl.id);
      setEditName(tpl.name);
      setEditDescription(tpl.description ?? '');
      setEditTabs(
        tpl.tabs.length
          ? tpl.tabs.map((t) => ({ name: t.name, keysText: t.keys.join('\n') }))
          : [{ name: '', keysText: '' }],
      );
      setEditorOpen(true);
    } catch (e) {
      message.error(extractErrorMessage(e, 'Failed to load template'));
    }
  };

  const submitSave = () => {
    if (!saveName.trim()) {
      message.error('Template name is required');
      return;
    }
    runSave.mutate();
  };

  const submitEditor = () => {
    if (!editName.trim()) {
      message.error('Template name is required');
      return;
    }
    if (!editTabs.some((t) => t.name.trim())) {
      message.error('At least one tab with a name is required');
      return;
    }
    saveEditor.mutate();
  };

  const saveMenuItems = useMemo(
    () => [
      {
        key: 'current',
        label: activeTableName ? `Save current tab (${activeTableName})` : 'Save current tab',
        disabled: activeTableId == null,
      },
      { key: 'all', label: 'Save all tabs' },
    ],
    [activeTableId, activeTableName],
  );

  return (
    <>
      <Space size={4}>
        <Tooltip title="Import a variable-table template into this artifact">
          <Button size="small" icon={<ImportOutlined />} disabled={disabled} onClick={openImport}>
            Import template
          </Button>
        </Tooltip>
        <Dropdown
          disabled={disabled || !hasTables}
          menu={{
            items: saveMenuItems,
            onClick: ({ key }) => openSave(key as 'current' | 'all'),
          }}
        >
          <Button size="small" icon={<SaveOutlined />} disabled={disabled || !hasTables}>
            Save as template <DownOutlined />
          </Button>
        </Dropdown>
        <Tooltip title="Manage templates">
          <Button size="small" icon={<SettingOutlined />} onClick={() => setManageOpen(true)} />
        </Tooltip>
      </Space>

      {/* Import */}
      <Modal
        title="Import variable-table template"
        open={importOpen}
        onCancel={() => setImportOpen(false)}
        onOk={() => runApply.mutate()}
        okText="Apply"
        okButtonProps={{ disabled: selectedTemplateId == null, loading: runApply.isPending }}
        destroyOnClose
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Typography.Text type="secondary">Template</Typography.Text>
            <Select
              style={{ width: '100%', marginTop: 4 }}
              placeholder="Select a template"
              loading={isLoading}
              value={selectedTemplateId ?? undefined}
              onChange={(v) => setSelectedTemplateId(v)}
              options={templates.map((t) => ({
                value: t.id,
                label: `${t.name} · ${t.tabCount} tab(s), ${t.keyCount} key(s)`,
              }))}
              notFoundContent={<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No templates yet" />}
            />
          </div>
          <div>
            <Typography.Text type="secondary">Mode</Typography.Text>
            <Radio.Group
              style={{ display: 'block', marginTop: 4 }}
              value={importMode}
              onChange={(e) => setImportMode(e.target.value)}
            >
              <Space direction="vertical">
                <Radio value="MERGE">
                  Merge — add missing tabs/keys, keep existing values
                </Radio>
                <Radio value="REPLACE">
                  Replace — clear all tabs first, then recreate from template (values emptied)
                </Radio>
              </Space>
            </Radio.Group>
          </div>
          {selectedPreview.data && (
            <div>
              <Typography.Text type="secondary">Preview</Typography.Text>
              <div style={{ marginTop: 4 }}>
                {selectedPreview.data.tabs.map((tab) => (
                  <div key={tab.name} style={{ marginBottom: 6 }}>
                    <Tag color="blue">{tab.name}</Tag>
                    {tab.keys.map((k) => (
                      <Tag key={k}>{k}</Tag>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Space>
      </Modal>

      {/* Save as template */}
      <Modal
        title={saveScope === 'current' ? 'Save current tab as template' : 'Save all tabs as template'}
        open={saveOpen}
        onCancel={() => setSaveOpen(false)}
        onOk={submitSave}
        okText="Save"
        okButtonProps={{ loading: runSave.isPending }}
        destroyOnClose
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Typography.Text type="secondary">
            Only tab names and keys are saved — values are never stored in a template.
          </Typography.Text>
          <Input
            placeholder="Template name"
            maxLength={200}
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
          />
          <Input.TextArea
            placeholder="Description (optional)"
            maxLength={4000}
            autoSize={{ minRows: 2, maxRows: 4 }}
            value={saveDescription}
            onChange={(e) => setSaveDescription(e.target.value)}
          />
        </Space>
      </Modal>

      {/* Manage */}
      <Modal
        title="Manage variable-table templates"
        open={manageOpen}
        onCancel={() => setManageOpen(false)}
        footer={null}
        width={640}
      >
        <div style={{ marginBottom: 12 }}>
          <Button icon={<PlusOutlined />} onClick={openEditorForNew}>
            New template
          </Button>
        </div>
        <List
          loading={isLoading}
          dataSource={templates}
          locale={{
            emptyText: (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No templates yet" />
            ),
          }}
          renderItem={(t) => (
            <List.Item
              actions={[
                <Button
                  key="edit"
                  type="text"
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => openEditorFor(t.id)}
                />,
                <Popconfirm
                  key="delete"
                  title="Delete this template?"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => removeTemplate.mutate(t.id)}
                >
                  <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>,
              ]}
            >
              <List.Item.Meta
                title={t.name}
                description={
                  <Space direction="vertical" size={0}>
                    <span>{`${t.tabCount} tab(s) · ${t.keyCount} key(s)`}</span>
                    {t.description && <Typography.Text type="secondary">{t.description}</Typography.Text>}
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      </Modal>

      {/* Editor */}
      <Modal
        title={editingId == null ? 'New template' : 'Edit template'}
        open={editorOpen}
        onCancel={() => setEditorOpen(false)}
        onOk={submitEditor}
        okText="Save"
        okButtonProps={{ loading: saveEditor.isPending }}
        width={640}
        destroyOnClose
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Input
            placeholder="Template name"
            maxLength={200}
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
          />
          <Input.TextArea
            placeholder="Description (optional)"
            maxLength={4000}
            autoSize={{ minRows: 1, maxRows: 3 }}
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
          />
          <Typography.Text type="secondary">Tabs (one key per line)</Typography.Text>
          {editTabs.map((tab, index) => (
            // eslint-disable-next-line react/no-array-index-key
            <div key={index} style={{ border: '1px solid #f0f0f0', borderRadius: 6, padding: 8 }}>
              <Space style={{ width: '100%', marginBottom: 6 }} align="start">
                <Input
                  placeholder="Tab name (e.g. DEV)"
                  maxLength={120}
                  value={tab.name}
                  onChange={(e) =>
                    setEditTabs((prev) =>
                      prev.map((t, i) => (i === index ? { ...t, name: e.target.value } : t)),
                    )
                  }
                />
                <Button
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => setEditTabs((prev) => prev.filter((_, i) => i !== index))}
                />
              </Space>
              <Input.TextArea
                placeholder={'KEY_ONE\nKEY_TWO'}
                autoSize={{ minRows: 2, maxRows: 8 }}
                value={tab.keysText}
                onChange={(e) =>
                  setEditTabs((prev) =>
                    prev.map((t, i) => (i === index ? { ...t, keysText: e.target.value } : t)),
                  )
                }
              />
            </div>
          ))}
          <Button
            type="dashed"
            icon={<PlusOutlined />}
            onClick={() => setEditTabs((prev) => [...prev, { name: '', keysText: '' }])}
          >
            Add tab
          </Button>
        </Space>
      </Modal>
    </>
  );
}
