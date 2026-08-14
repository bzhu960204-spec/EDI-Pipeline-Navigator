import { useMemo, useState, type ReactNode } from 'react';
import {
  Alert,
  App as AntApp,
  Badge,
  Button,
  Checkbox,
  Collapse,
  Divider,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Rate,
  Row,
  Segmented,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  Upload,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  EditOutlined,
  DeleteOutlined,
  PlusOutlined,
  EditFilled,
  ImportOutlined,
  ExportOutlined,
  InboxOutlined,
  FolderOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  createWorkflow,
  deleteWorkflow,
  exportBundle,
  fetchFolders,
  fetchWorkflows,
  importBundle,
  importWorkflow,
  setWorkflowConfidence,
  updateWorkflow,
  type BundleImportResult,
  type ConflictPolicy,
  type ImportWorkflowPayload,
  type Workflow,
  type WorkflowBundle,
  type WorkflowPayload,
  type WorkflowStatus,
} from '../../api/workflow';
import { extractErrorMessage } from '../../api/client';
import { isAdmin, useAuthStore } from '../auth/authStore';
import { FolderManagerPanel } from './FolderManagerPanel';
import { colorForTag } from './tagColor';
import { DropZone, dragRowComponents } from './workflowDnd';

type LibraryView = 'table' | 'groups';
const VIEW_STORAGE_KEY = 'edinav-workflow-view';
const EXPANDED_STORAGE_KEY = 'edinav-workflow-expanded';
const UNGROUPED_KEY = 'ungrouped';

interface FormValues {
  name: string;
  description?: string;
  status: WorkflowStatus;
  folderId?: number | null;
  tags?: string[];
}

function statusColor(status: WorkflowStatus) {
  return status === 'PUBLISHED' ? 'green' : 'default';
}

// 1-2 low (red), 3-4 medium (orange), 5 high (green); 0 has no filled stars.
function confidenceColor(value: number) {
  if (value >= 5) return '#52c41a';
  if (value >= 3) return '#faad14';
  if (value >= 1) return '#ff4d4f';
  return undefined;
}
export function SubWorkflowsPage() {
  const { message } = AntApp.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const admin = isAdmin(useAuthStore((s) => s.user));
  const [form] = Form.useForm<FormValues>();

  const [editing, setEditing] = useState<Workflow | null | undefined>(undefined);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importMode, setImportMode] = useState<'single' | 'batch'>('single');
  const [conflictPolicy, setConflictPolicy] = useState<ConflictPolicy>('SKIP');
  const [importResult, setImportResult] = useState<BundleImportResult | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([]);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportIds, setExportIds] = useState<number[]>([]);
  const [exportIncludePhases, setExportIncludePhases] = useState(false);
  const [exportIncludeReviews, setExportIncludeReviews] = useState(false);
  const [foldersOpen, setFoldersOpen] = useState(false);

  // Filters live in the URL query string so they survive navigating into a flow and back.
  const [searchParams, setSearchParams] = useSearchParams();
  const setFilterParam = (key: string, value: string | undefined) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value == null || value === '') next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true },
    );

  const search = searchParams.get('q') ?? '';
  const setSearch = (v: string) => setFilterParam('q', v);
  const statusFilter = (searchParams.get('status') as WorkflowStatus) || undefined;
  const setStatusFilter = (v: WorkflowStatus | undefined) => setFilterParam('status', v);
  const tagFilter = useMemo(
    () => searchParams.get('tags')?.split(',').filter(Boolean) ?? [],
    [searchParams],
  );
  const setTagFilter = (v: string[]) => setFilterParam('tags', v.length ? v.join(',') : undefined);
  const minConfidence = searchParams.get('minConf') ? Number(searchParams.get('minConf')) : undefined;
  const setMinConfidence = (v: number | undefined) =>
    setFilterParam('minConf', v != null ? String(v) : undefined);
  const [tagFilterSearch, setTagFilterSearch] = useState('');
  const [tagFieldSearch, setTagFieldSearch] = useState('');
  const [view, setView] = useState<LibraryView>(
    () => (localStorage.getItem(VIEW_STORAGE_KEY) as LibraryView) || 'table',
  );
  const [expandedKeys, setExpandedKeys] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(EXPANDED_STORAGE_KEY) ?? '[]') as string[];
    } catch {
      return [];
    }
  });

  const selectView = (next: LibraryView) => {
    setView(next);
    localStorage.setItem(VIEW_STORAGE_KEY, next);
  };

  const onExpandChange = (keys: string | string[]) => {
    const next = Array.isArray(keys) ? keys : [keys];
    setExpandedKeys(next);
    localStorage.setItem(EXPANDED_STORAGE_KEY, JSON.stringify(next));
  };

  const { data: workflows = [], isLoading } = useQuery({
    queryKey: ['workflows'],
    queryFn: () => fetchWorkflows(),
  });

  const { data: folders = [] } = useQuery({ queryKey: ['folders'], queryFn: fetchFolders });

  const allTags = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const wf of workflows) {
      for (const t of wf.tags) {
        if (!seen.has(t)) {
          seen.add(t);
          list.push(t);
        }
      }
    }
    return list.sort((a, b) => a.localeCompare(b));
  }, [workflows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return workflows.filter((wf) => {
      if (statusFilter && wf.status !== statusFilter) return false;
      if (tagFilter.length > 0 && !tagFilter.every((t) => wf.tags.includes(t))) return false;
      if (minConfidence != null && (wf.confidence ?? 0) < minConfidence) return false;
      if (q) {
        const haystack = `${wf.name} ${wf.description ?? ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [workflows, search, statusFilter, tagFilter, minConfidence]);

  const hasFilters =
    search.trim() !== '' ||
    statusFilter !== undefined ||
    tagFilter.length > 0 ||
    minConfidence !== undefined;
  const clearFilters = () =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        ['q', 'status', 'tags', 'minConf'].forEach((k) => next.delete(k));
        return next;
      },
      { replace: true },
    );

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['workflows'] });

  const openWorkflow = (wf: Workflow) => {
    const qs = searchParams.toString();
    navigate(`/workflow/edit/${wf.id}`, {
      state: { returnTo: qs ? `/workflow?${qs}` : '/workflow' },
    });
  };

  const save = useMutation({
    mutationFn: (values: FormValues) => {
      const payload: WorkflowPayload = {
        name: values.name,
        description: values.description,
        status: values.status,
        folderId: values.folderId ?? null,
        tags: values.tags ?? [],
      };
      return editing ? updateWorkflow(editing.id, payload) : createWorkflow(payload);
    },
    onSuccess: () => {
      message.success('Workflow saved');
      setEditing(undefined);
      invalidate();
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to save workflow')),
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteWorkflow(id),
    onSuccess: () => {
      message.success('Workflow deleted');
      invalidate();
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to delete workflow')),
  });

  const setConfidence = useMutation({
    mutationFn: ({ id, value }: { id: number; value: number }) => setWorkflowConfidence(id, value),
    onMutate: async ({ id, value }) => {
      await queryClient.cancelQueries({ queryKey: ['workflows'] });
      const prev = queryClient.getQueryData<Workflow[]>(['workflows']);
      queryClient.setQueryData<Workflow[]>(['workflows'], (old) =>
        (old ?? []).map((w) => (w.id === id ? { ...w, confidence: value } : w)),
      );
      return { prev };
    },
    onError: (e, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['workflows'], ctx.prev);
      message.error(extractErrorMessage(e, 'Failed to update confidence'));
    },
    onSettled: () => {
      invalidate();
    },
  });

  const move = useMutation({
    mutationFn: ({ wf, folderId }: { wf: Workflow; folderId: number | null }) =>
      updateWorkflow(wf.id, {
        name: wf.name,
        description: wf.description ?? undefined,
        status: wf.status,
        folderId,
        tags: wf.tags,
      }),
    onMutate: async ({ wf, folderId }) => {
      await queryClient.cancelQueries({ queryKey: ['workflows'] });
      const prev = queryClient.getQueryData<Workflow[]>(['workflows']);
      queryClient.setQueryData<Workflow[]>(['workflows'], (old) =>
        (old ?? []).map((w) => (w.id === wf.id ? { ...w, folderId } : w)),
      );
      return { prev };
    },
    onError: (e, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['workflows'], ctx.prev);
      message.error(extractErrorMessage(e, 'Failed to move workflow'));
    },
    onSettled: () => invalidate(),
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [activeWf, setActiveWf] = useState<Workflow | null>(null);

  const onDragStart = (e: DragStartEvent) => {
    const id = e.active.data.current?.workflowId as number | undefined;
    setActiveWf(workflows.find((w) => w.id === id) ?? null);
  };

  const onDragEnd = (e: DragEndEvent) => {
    setActiveWf(null);
    const wfId = e.active.data.current?.workflowId as number | undefined;
    if (wfId == null || e.over == null) return;
    const wf = workflows.find((w) => w.id === wfId);
    if (!wf) return;
    const dest = (e.over.data.current?.folderId ?? null) as number | null;
    if ((wf.folderId ?? null) === dest) return;
    move.mutate({ wf, folderId: dest });
  };


  const runImport = useMutation({
    mutationFn: (payload: ImportWorkflowPayload) => importWorkflow(payload),
    onSuccess: (wf) => {
      message.success(`Imported "${wf.name}"`);
      closeImport();
      invalidate();
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to import workflow')),
  });

  const runImportBundle = useMutation({
    mutationFn: ({ bundle, policy }: { bundle: WorkflowBundle; policy: ConflictPolicy }) =>
      importBundle(bundle, policy),
    onSuccess: (result) => {
      setImportResult(result);
      const okCount = result.imported.length;
      const failCount = result.failed.length;
      if (okCount > 0) message.success(`Imported ${okCount} workflow(s)`);
      if (failCount > 0) message.warning(`${failCount} skipped or failed`);
      invalidate();
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to import bundle')),
  });

  const closeImport = () => {
    setImportOpen(false);
    setImportText('');
    setImportResult(null);
  };

  // Auto-detect the bundle envelope so pasting/uploading a batch file flips the mode for the user.
  const looksLikeBundle = (parsed: unknown): parsed is WorkflowBundle =>
    typeof parsed === 'object' &&
    parsed !== null &&
    Array.isArray((parsed as WorkflowBundle).workflows);

  const submitImport = () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(importText);
    } catch {
      message.error('Invalid JSON');
      return;
    }
    if (importMode === 'batch') {
      if (!looksLikeBundle(parsed)) {
        message.error('Batch file must contain a "workflows" array');
        return;
      }
      if (parsed.workflows.length === 0) {
        message.error('Bundle contains no workflows');
        return;
      }
      runImportBundle.mutate({ bundle: parsed, policy: conflictPolicy });
      return;
    }
    const payload = parsed as ImportWorkflowPayload;
    if (!payload || typeof payload.name !== 'string' || !payload.name.trim()) {
      message.error('JSON must include a non-empty "name"');
      return;
    }
    runImport.mutate(payload);
  };

  const onImportFile = (file: File) => {
    file.text().then((text) => {
      setImportText(text);
      try {
        if (looksLikeBundle(JSON.parse(text))) setImportMode('batch');
      } catch {
        /* ignore parse errors here; submit re-validates */
      }
    });
    return false;
  };

  const downloadBundle = (bundle: WorkflowBundle) => {
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    const stamp = new Date().toISOString().slice(0, 10);
    anchor.download = `edinav-workflows-${bundle.count ?? bundle.workflows.length}-${stamp}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const runExport = useMutation({
    mutationFn: ({
      ids,
      includePhases,
      includeReviews,
    }: {
      ids: number[];
      includePhases: boolean;
      includeReviews: boolean;
    }) => exportBundle(ids, includePhases, includeReviews),
    onSuccess: (bundle) => {
      downloadBundle(bundle);
      setExportOpen(false);
      message.success(`Exported ${bundle.count ?? bundle.workflows.length} workflow(s)`);
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to export workflows')),
  });

  const openExport = (ids: number[]) => {
    setExportIds(ids);
    setExportOpen(true);
  };

  const openCreate = () => {
    setEditing(null);
    form.setFieldsValue({ name: '', description: '', status: 'DRAFT', folderId: null, tags: [] });
  };

  const openEdit = (wf: Workflow) => {
    setEditing(wf);
    form.setFieldsValue({
      name: wf.name,
      description: wf.description ?? '',
      status: wf.status,
      folderId: wf.folderId ?? null,
      tags: wf.tags,
    });
  };

  const columns: ColumnsType<Workflow> = [
    {
      title: 'Name',
      dataIndex: 'name',
      render: (name: string, wf) => (
        <Button type="link" style={{ padding: 0 }} onClick={() => openWorkflow(wf)}>
          {name}
        </Button>
      ),
    },
    {
      title: 'Version',
      key: 'version',
      width: 150,
      render: (_, wf) => (
        <Space size={4}>
          <span>v{wf.version}</span>
          {wf.versionLabel && (
            <Typography.Text type="secondary" ellipsis style={{ maxWidth: 100 }}>
              {wf.versionLabel}
            </Typography.Text>
          )}
        </Space>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 120,
      render: (status: WorkflowStatus) => <Tag color={statusColor(status)}>{status}</Tag>,
    },
    { title: 'Steps', dataIndex: 'stepCount', width: 80 },
    {
      title: 'Confidence',
      key: 'confidence',
      width: 160,
      render: (_, wf) => (
        <Tooltip title={admin ? 'Click to rate (click same star to clear)' : `${wf.confidence ?? 0} / 5`}>
          <Rate
            allowClear
            disabled={!admin}
            style={{ color: confidenceColor(wf.confidence ?? 0) }}
            value={wf.confidence ?? 0}
            onChange={(value) => setConfidence.mutate({ id: wf.id, value })}
          />
        </Tooltip>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 300,
      render: (_, wf) => (
        <Space>
          <Button size="small" icon={<EditFilled />} onClick={() => openWorkflow(wf)}>
            Open editor
          </Button>
          {admin && (
            <>
              <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(wf)} />
              <Popconfirm
                title="Delete this version?"
                description="Its steps and transitions will be removed."
                onConfirm={() => remove.mutate(wf.id)}
              >
                <Button size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            </>
          )}
        </Space>
      ),
    },
  ];

  const groupTable = (rows: Workflow[]) => (
    <Table
      rowKey="id"
      columns={columns}
      dataSource={rows}
      pagination={false}
      size="small"
      components={admin ? dragRowComponents : undefined}
      locale={{ emptyText: admin ? 'Drop a workflow here' : 'No workflows in this folder' }}
    />
  );

  const groupHeader = (name: string, count: number, color: string, description?: string | null) => (
    <Space>
      <Tag color={color}>{name}</Tag>
      <Badge count={count} showZero color="#8c8c8c" />
      {description && (
        <Typography.Text type="secondary" ellipsis style={{ maxWidth: 320 }}>
          {description}
        </Typography.Text>
      )}
    </Space>
  );

  const groupItems = useMemo(() => {
    const byFolder = new Map<number, Workflow[]>();
    const ungrouped: Workflow[] = [];
    const folderIds = new Set(folders.map((f) => f.id));
    for (const wf of filtered) {
      if (wf.folderId != null && folderIds.has(wf.folderId)) {
        const list = byFolder.get(wf.folderId) ?? [];
        list.push(wf);
        byFolder.set(wf.folderId, list);
      } else {
        ungrouped.push(wf);
      }
    }
    const items = folders
      .filter((folder) => (byFolder.get(folder.id)?.length ?? 0) > 0 || !hasFilters || admin)
      .map((folder) => {
        const rows = byFolder.get(folder.id) ?? [];
        return {
          key: `folder-${folder.id}`,
          label: (
            <DropZone id={`hdr-folder-${folder.id}`} folderId={folder.id}>
              {groupHeader(folder.name, rows.length, colorForTag(folder.name), folder.description)}
            </DropZone>
          ),
          children: (
            <DropZone id={`body-folder-${folder.id}`} folderId={folder.id}>
              {groupTable(rows)}
            </DropZone>
          ),
        };
      });
    if (ungrouped.length > 0 || admin) {
      items.push({
        key: UNGROUPED_KEY,
        label: (
          <DropZone id="hdr-ungrouped" folderId={null}>
            {groupHeader('Ungrouped', ungrouped.length, 'default')}
          </DropZone>
        ),
        children: (
          <DropZone id="body-ungrouped" folderId={null}>
            {groupTable(ungrouped)}
          </DropZone>
        ),
      });
    }
    return items;
    // groupTable/groupHeader are stable render helpers; columns rebuilds each render (acceptable)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, folders, hasFilters, admin]);

  const plainCollapse = (
    <Collapse items={groupItems} activeKey={expandedKeys} onChange={onExpandChange} />
  );
  let groupsView: ReactNode;
  if (groupItems.length === 0) {
    groupsView = (
      <Empty description={hasFilters ? 'No workflows match the filters' : 'No workflows yet'} />
    );
  } else if (admin) {
    groupsView = (
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveWf(null)}
      >
        {plainCollapse}
        <DragOverlay dropAnimation={null}>
          {activeWf ? (
            <Tag color={colorForTag(activeWf.name)} style={{ padding: '2px 8px' }}>
              {activeWf.name}
            </Tag>
          ) : null}
        </DragOverlay>
      </DndContext>
    );
  } else {
    groupsView = plainCollapse;
  }

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Workflows
        </Typography.Title>
        <Space>
          {selectedRowKeys.length > 0 && (
            <Button
              icon={<ExportOutlined />}
              onClick={() => openExport(selectedRowKeys)}
            >
              Export selected ({selectedRowKeys.length})
            </Button>
          )}
          <Button icon={<ExportOutlined />} onClick={() => openExport([])}>
            Export all
          </Button>
          {admin && (
            <>
              <Button icon={<FolderOutlined />} onClick={() => setFoldersOpen(true)}>
                Manage folders
              </Button>
              <Button icon={<ImportOutlined />} onClick={() => setImportOpen(true)}>
                Import JSON
              </Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                New workflow
              </Button>
            </>
          )}
        </Space>
      </Row>

      <Space wrap style={{ marginBottom: 16 }}>
        <Input.Search
          allowClear
          placeholder="Search name or description"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 260 }}
        />
        <Select
          allowClear
          placeholder="Status"
          value={statusFilter}
          onChange={(v) => setStatusFilter(v)}
          style={{ width: 140 }}
          options={[
            { value: 'DRAFT', label: 'Draft' },
            { value: 'PUBLISHED', label: 'Published' },
          ]}
        />
        <Select
          allowClear
          mode="multiple"
          placeholder="Tags"
          value={tagFilter}
          onChange={(v) => setTagFilter(v)}
          searchValue={tagFilterSearch}
          onSearch={setTagFilterSearch}
          open={tagFilterSearch.length > 0}
          notFoundContent={null}
          style={{ minWidth: 220 }}
          options={allTags.map((t) => ({ value: t, label: t }))}
        />
        <Select
          allowClear
          placeholder="Min confidence"
          value={minConfidence}
          onChange={(v) => setMinConfidence(v)}
          style={{ width: 160 }}
          options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: `${n}+ stars` }))}
        />
        {hasFilters && <Button onClick={clearFilters}>Clear filters</Button>}
        <Segmented
          value={view}
          onChange={(v) => selectView(v as LibraryView)}
          options={[
            { label: 'Table', value: 'table' },
            { label: 'Groups', value: 'groups' },
          ]}
        />
      </Space>

      {view === 'table' ? (
        <Table
          rowKey="id"
          loading={isLoading}
          columns={columns}
          dataSource={filtered}
          rowSelection={{
            selectedRowKeys,
            onChange: (keys) => setSelectedRowKeys(keys as number[]),
            preserveSelectedRowKeys: true,
          }}
          pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => `${total} workflow(s)` }}
        />
      ) : (
        groupsView
      )}

      <Modal
        open={editing !== undefined}
        title={editing ? 'Edit workflow' : 'New workflow'}
        okText="Save"
        confirmLoading={save.isPending}
        onCancel={() => setEditing(undefined)}
        onOk={() => form.submit()}
      >
        <Form form={form} layout="vertical" onFinish={(values) => save.mutate(values)}>
          <Form.Item name="name" label="Name" rules={[{ required: true, max: 200 }]}>
            <Input placeholder="e.g. JP-MBL Import Parsing" />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={3} maxLength={4000} />
          </Form.Item>
          <Form.Item name="folderId" label="Folder">
            <Select
              allowClear
              placeholder="Ungrouped"
              options={folders.map((f) => ({ value: f.id, label: f.name }))}
            />
          </Form.Item>
          <Form.Item name="tags" label="Tags">
            <Select
              mode="tags"
              allowClear
              placeholder="Type a tag and press Enter"
              tokenSeparators={[',']}
              searchValue={tagFieldSearch}
              onSearch={setTagFieldSearch}
              onChange={() => setTagFieldSearch('')}
              open={tagFieldSearch.length > 0}
              notFoundContent={null}
              options={allTags.map((t) => ({ value: t, label: t }))}
            />
          </Form.Item>
          <Form.Item name="status" label="Status" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'DRAFT', label: 'Draft' },
                { value: 'PUBLISHED', label: 'Published' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={importOpen}
        title="Import workflows from JSON"
        okText={importMode === 'batch' ? 'Import bundle' : 'Import'}
        confirmLoading={runImport.isPending || runImportBundle.isPending}
        onCancel={closeImport}
        onOk={submitImport}
        width={640}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Segmented
            block
            value={importMode}
            onChange={(v) => setImportMode(v as 'single' | 'batch')}
            options={[
              { label: 'Single workflow', value: 'single' },
              { label: 'Batch (bundle)', value: 'batch' },
            ]}
          />
          {importMode === 'batch' && (
            <Space>
              <Typography.Text>On name conflict:</Typography.Text>
              <Select
                value={conflictPolicy}
                onChange={(v) => setConflictPolicy(v)}
                style={{ width: 220 }}
                options={[
                  { value: 'SKIP', label: 'Skip existing' },
                  { value: 'RENAME', label: 'Import as a renamed copy' },
                ]}
              />
            </Space>
          )}
          <Upload.Dragger accept=".json,application/json" showUploadList={false} beforeUpload={onImportFile}>
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">Drag a JSON file here, or click to browse</p>
          </Upload.Dragger>
          <Input.TextArea
            rows={12}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder={
              importMode === 'batch'
                ? '{ "format": "edinav-workflow-bundle", "workflows": [ ... ] }'
                : '{ "name": "...", "steps": [ ... ], "transitions": [ ... ] }'
            }
          />
          <Typography.Text type="secondary">
            Missing business roles are created automatically. See the README for the full template.
          </Typography.Text>
          {importResult && (
            <>
              <Divider style={{ margin: '4px 0' }} />
              <Alert
                type={importResult.failed.length === 0 ? 'success' : 'warning'}
                showIcon
                message={`${importResult.imported.length} imported, ${importResult.failed.length} skipped/failed`}
                description={
                  importResult.failed.length > 0 ? (
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {importResult.failed.map((f) => (
                        <li key={f.name}>
                          <Typography.Text strong>{f.name}</Typography.Text>: {f.reason}
                        </li>
                      ))}
                    </ul>
                  ) : undefined
                }
              />
            </>
          )}
        </Space>
      </Modal>

      <Modal
        open={exportOpen}
        title={exportIds.length > 0 ? `Export ${exportIds.length} selected workflow(s)` : 'Export all workflows'}
        okText="Download"
        confirmLoading={runExport.isPending}
        onCancel={() => setExportOpen(false)}
        onOk={() =>
          runExport.mutate({
            ids: exportIds,
            includePhases: exportIncludePhases,
            includeReviews: exportIncludeReviews,
          })
        }
        width={520}
      >
        <Space direction="vertical" size="middle">
          <Typography.Text type="secondary">
            Downloads a single JSON bundle that can be imported into another instance.
          </Typography.Text>
          <Checkbox
            checked={exportIncludePhases}
            onChange={(e) => setExportIncludePhases(e.target.checked)}
          >
            Include phases
          </Checkbox>
          <Checkbox
            checked={exportIncludeReviews}
            onChange={(e) => setExportIncludeReviews(e.target.checked)}
          >
            Include step reviews
          </Checkbox>
        </Space>
      </Modal>

      <Modal
        open={foldersOpen}
        title="Manage workflow folders"
        footer={null}
        width={560}
        onCancel={() => setFoldersOpen(false)}
      >
        <FolderManagerPanel folders={folders} editable={admin} />
      </Modal>
    </div>
  );
}
