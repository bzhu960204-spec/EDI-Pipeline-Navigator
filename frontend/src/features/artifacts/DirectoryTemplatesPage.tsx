import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  App as AntApp,
  Breadcrumb,
  Button,
  Card,
  Col,
  Divider,
  Empty,
  Input,
  List,
  Modal,
  Popconfirm,
  Row,
  Space,
  Spin,
  Switch,
  Tag,
  Tooltip,
  Tree,
  Typography,
  Upload,
} from 'antd';
import type { DataNode } from 'antd/es/tree';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  CheckCircleOutlined,
  CopyOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  FileTextOutlined,
  FolderAddOutlined,
  FolderOutlined,
  ImportOutlined,
  InboxOutlined,
  LoadingOutlined,
  PlusOutlined,
  SaveOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createTemplate,
  deleteTemplate,
  exportTemplate,
  fetchTemplate,
  fetchTemplates,
  importTemplate,
  updateTemplate,
  updateTemplateFromImport,
  type TemplateChecklistItem,
  type TemplateDetail,
  type TemplateNode,
  type TemplateNodeInput,
  type TemplatePayload,
} from '../../api/templates';
import { extractErrorMessage } from '../../api/client';
import { useAuthStore } from '../auth/authStore';

interface EditNode {
  key: string;
  name: string;
  description?: string;
  children: EditNode[];
  checklist: TemplateChecklistItem[];
}

let keyCounter = 0;
const nextKey = () => `n${++keyCounter}`;

/** Virtual tree key for the template root (top level). Never produced by nextKey(). */
const ROOT_KEY = '__root__';

/** A locally persisted, not-yet-saved editing draft for one template (or a new one). */
interface TemplateDraft {
  payload: TemplatePayload;
  signature: string;
  ts: number;
}

const DRAFT_PREFIX = 'edinav:template-draft:';
const EMPTY_SIGNATURE = JSON.stringify({
  name: '',
  description: null,
  isDefault: false,
  nodes: [],
  checklist: [],
});
const draftKey = (id: number | 'new') => `${DRAFT_PREFIX}${id}`;

function readDraft(id: number | 'new'): TemplateDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(id));
    return raw ? (JSON.parse(raw) as TemplateDraft) : null;
  } catch {
    return null;
  }
}

function writeDraft(id: number | 'new', draft: TemplateDraft) {
  try {
    localStorage.setItem(draftKey(id), JSON.stringify(draft));
  } catch {
    /* storage full or unavailable — ignore */
  }
}

function clearDraft(id: number | 'new') {
  try {
    localStorage.removeItem(draftKey(id));
  } catch {
    /* ignore */
  }
}

function toEditTree(nodes: TemplateNode[]): EditNode[] {
  return nodes.map((n) => ({
    key: nextKey(),
    name: n.name,
    description: n.description ?? undefined,
    children: toEditTree(n.children ?? []),
    checklist: (n.checklist ?? []).map((c) => ({ ...c })),
  }));
}

/** Rebuilds editable nodes with fresh keys from a persisted draft payload. */
function inputToEditTree(nodes: TemplateNodeInput[]): EditNode[] {
  return nodes.map((n) => ({
    key: nextKey(),
    name: n.name,
    description: n.description ?? undefined,
    children: inputToEditTree(n.children ?? []),
    checklist: (n.checklist ?? []).map((c) => ({ ...c })),
  }));
}

/** Normalized signature of the server-side template, matching the editor's payload shape. */
function serverSignature(d: TemplateDetail): string {
  return JSON.stringify({
    name: d.name.trim(),
    description: d.description?.trim() ? d.description.trim() : null,
    isDefault: d.isDefault,
    nodes: toInput(toEditTree(d.nodes)),
    checklist: cleanChecklist((d.checklist ?? []).map((c) => ({ ...c }))),
  });
}

function toInput(nodes: EditNode[]): TemplateNodeInput[] {
  return nodes.map((n) => ({
    name: n.name.trim(),
    description: n.description?.trim() ? n.description.trim() : null,
    children: toInput(n.children),
    checklist: cleanChecklist(n.checklist),
  }));
}

/** Drops blank-label items and trims text before sending to the API. */
function cleanChecklist(items: TemplateChecklistItem[]): TemplateChecklistItem[] {
  return (items ?? [])
    .filter((c) => c.label.trim())
    .map((c) => ({
      label: c.label.trim(),
      description: c.description?.trim() ? c.description.trim() : null,
      required: c.required,
    }));
}

function toTreeData(nodes: EditNode[]): DataNode[] {
  return nodes.map((n) => {
    const name = n.name.trim();
    const purpose = n.description?.trim();
    const title = (
      <Tooltip placement="right" title={purpose || 'No purpose set yet'}>
        <span style={{ color: purpose ? undefined : 'rgba(255,255,255,0.45)' }}>
          {name || <Typography.Text type="danger">(unnamed)</Typography.Text>}
        </span>
      </Tooltip>
    );
    return {
      key: n.key,
      icon: <FolderOutlined />,
      title,
      children: n.children.length ? toTreeData(n.children) : undefined,
    };
  });
}

function collectKeys(nodes: EditNode[]): string[] {
  return nodes.flatMap((n) => [n.key, ...collectKeys(n.children)]);
}

function findNode(nodes: EditNode[], key: string): EditNode | null {
  for (const n of nodes) {
    if (n.key === key) return n;
    const found = findNode(n.children, key);
    if (found) return found;
  }
  return null;
}

/** Returns the trail of folder names from the root down to the node with `key`. */
function findPath(nodes: EditNode[], key: string, trail: string[] = []): string[] | null {
  for (const n of nodes) {
    const step = [...trail, n.name.trim() || '(unnamed)'];
    if (n.key === key) return step;
    const found = findPath(n.children, key, step);
    if (found) return found;
  }
  return null;
}

/** Counts named folders that have no purpose description. */
function countMissingPurpose(nodes: EditNode[]): number {
  return nodes.reduce(
    (acc, n) =>
      acc + (n.name.trim() && !n.description?.trim() ? 1 : 0) + countMissingPurpose(n.children),
    0,
  );
}

function treeToMarkdownLines(nodes: EditNode[], depth: number): string[] {
  return nodes.flatMap((n) => {
    const indent = '  '.repeat(depth);
    const name = n.name.trim() || '(unnamed)';
    const purpose = n.description?.trim();
    const suffix = purpose ? ` \u2014 ${purpose}` : '';
    const line = `${indent}- **${name}**${suffix}`;
    return [line, ...treeToMarkdownLines(n.children, depth + 1)];
  });
}

function templateToMarkdown(name: string, description: string, nodes: EditNode[]): string {
  const lines = [`# ${name.trim() || 'Untitled template'}`];
  if (description.trim()) lines.push('', description.trim());
  lines.push('', ...treeToMarkdownLines(nodes, 0));
  return lines.join('\n');
}

function DocNodes({ nodes }: Readonly<{ nodes: EditNode[] }>) {
  return (
    <ul style={{ margin: 0, paddingLeft: 18 }}>
      {nodes.map((n) => {
        const purpose = n.description?.trim();
        return (
          <li key={n.key} style={{ marginBottom: 6 }}>
            <Typography.Text strong>{n.name.trim() || '(unnamed)'}</Typography.Text>
            {purpose ? (
              <Typography.Text type="secondary"> — {purpose}</Typography.Text>
            ) : (
              <Typography.Text type="secondary" italic>
                {' — no purpose'}
              </Typography.Text>
            )}
            {n.children.length > 0 && <DocNodes nodes={n.children} />}
          </li>
        );
      })}
    </ul>
  );
}

function mapNode(nodes: EditNode[], key: string, fn: (n: EditNode) => EditNode): EditNode[] {
  return nodes.map((n) =>
    n.key === key ? fn(n) : { ...n, children: mapNode(n.children, key, fn) },
  );
}

function removeNode(nodes: EditNode[], key: string): EditNode[] {
  return nodes
    .filter((n) => n.key !== key)
    .map((n) => ({ ...n, children: removeNode(n.children, key) }));
}

function addChild(nodes: EditNode[], parentKey: string | null, child: EditNode): EditNode[] {
  if (parentKey == null) return [...nodes, child];
  return mapNode(nodes, parentKey, (n) => ({ ...n, children: [...n.children, child] }));
}

/** Moves the node with `key` up or down among its siblings. Returns a new tree. */
function moveSibling(nodes: EditNode[], key: string, dir: -1 | 1): EditNode[] {
  const idx = nodes.findIndex((n) => n.key === key);
  if (idx !== -1) {
    const target = idx + dir;
    if (target < 0 || target >= nodes.length) return nodes;
    const copy = [...nodes];
    [copy[idx], copy[target]] = [copy[target], copy[idx]];
    return copy;
  }
  return nodes.map((n) => ({ ...n, children: moveSibling(n.children, key, dir) }));
}

interface ChecklistEditorProps {
  items: TemplateChecklistItem[];
  admin: boolean;
  onChange: (items: TemplateChecklistItem[]) => void;
  title?: string;
}

const CHECKLIST_GRID = '96px minmax(0, 1.4fr) minmax(0, 1fr) 96px';

/** Read-only, scannable presentation of a folder's expected-files checklist. */
function ChecklistView({ items }: Readonly<{ items: TemplateChecklistItem[] }>) {
  if (items.length === 0) {
    return (
      <Typography.Text type="secondary" italic>
        No expected files defined for this folder.
      </Typography.Text>
    );
  }
  return (
    <List
      size="small"
      dataSource={items}
      split
      renderItem={(it) => (
        <List.Item style={{ paddingInline: 0, alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%' }}>
            <Tooltip title={it.required ? 'Mandatory' : 'Optional'}>
              <Tag
                color={it.required ? 'red' : 'default'}
                style={{ marginTop: 2, minWidth: 22, marginInlineEnd: 0, textAlign: 'center' }}
              >
                {it.required ? 'M' : 'O'}
              </Tag>
            </Tooltip>
            <div style={{ minWidth: 0, flex: 1 }}>
              <Typography.Text
                style={{ fontFamily: 'var(--font-mono, monospace)', overflowWrap: 'anywhere' }}
              >
                {it.label}
              </Typography.Text>
              {it.description?.trim() && (
                <Typography.Paragraph
                  type="secondary"
                  style={{ margin: '2px 0 0', fontSize: 12, whiteSpace: 'pre-wrap' }}
                >
                  {it.description}
                </Typography.Paragraph>
              )}
            </div>
          </div>
        </List.Item>
      )}
    />
  );
}

/** Spacious grid editor for a checklist, intended to live inside a wide modal. */
function ChecklistTable({
  items,
  onChange,
}: Readonly<{ items: TemplateChecklistItem[]; onChange: (items: TemplateChecklistItem[]) => void }>) {
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');

  const patch = (idx: number, part: Partial<TemplateChecklistItem>) =>
    onChange(items.map((it, i) => (i === idx ? { ...it, ...part } : it)));
  const add = () => onChange([...items, { label: '', description: '', required: true }]);
  const remove = (idx: number) => onChange(items.filter((_, i) => i !== idx));
  const move = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
  };

  const applyBulk = () => {
    const parsed = bulkText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map<TemplateChecklistItem>((label) => ({ label, description: '', required: true }));
    if (parsed.length > 0) onChange([...items, ...parsed]);
    setBulkText('');
    setBulkOpen(false);
  };

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      {items.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="No expected files yet. Add the files reviewers should look for in this folder."
        />
      ) : (
        <div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: CHECKLIST_GRID,
              gap: 12,
              padding: '0 4px 6px',
              fontSize: 12,
              color: 'rgba(140,140,140,1)',
            }}
          >
            <span>Required</span>
            <span>File name / pattern</span>
            <span>Note</span>
            <span style={{ textAlign: 'right' }}>Order</span>
          </div>
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            {items.map((it, idx) => (
              <div
                key={idx}
                style={{
                  display: 'grid',
                  gridTemplateColumns: CHECKLIST_GRID,
                  gap: 12,
                  alignItems: 'start',
                }}
              >
                <Tag
                  color={it.required ? 'red' : 'default'}
                  onClick={() => patch(idx, { required: !it.required })}
                  style={{ cursor: 'pointer', textAlign: 'center', marginTop: 4, userSelect: 'none' }}
                >
                  {it.required ? 'Mandatory' : 'Optional'}
                </Tag>
                <Input.TextArea
                  value={it.label}
                  maxLength={200}
                  autoSize={{ minRows: 1, maxRows: 4 }}
                  placeholder="e.g. DSV_<EDIT number>_JPMBL_1.0_ffid.json"
                  onChange={(e) => patch(idx, { label: e.target.value })}
                />
                <Input.TextArea
                  value={it.description ?? ''}
                  maxLength={400}
                  autoSize={{ minRows: 1, maxRows: 4 }}
                  placeholder="Note (optional)"
                  onChange={(e) => patch(idx, { description: e.target.value })}
                />
                <Space size={2} style={{ justifySelf: 'end', marginTop: 2 }}>
                  <Tooltip title="Move up">
                    <Button
                      size="small"
                      type="text"
                      icon={<ArrowUpOutlined />}
                      disabled={idx === 0}
                      onClick={() => move(idx, -1)}
                    />
                  </Tooltip>
                  <Tooltip title="Move down">
                    <Button
                      size="small"
                      type="text"
                      icon={<ArrowDownOutlined />}
                      disabled={idx === items.length - 1}
                      onClick={() => move(idx, 1)}
                    />
                  </Tooltip>
                  <Tooltip title="Remove">
                    <Button
                      size="small"
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => remove(idx)}
                    />
                  </Tooltip>
                </Space>
              </div>
            ))}
          </Space>
        </div>
      )}
      <Space wrap>
        <Button icon={<PlusOutlined />} onClick={add}>
          Add file
        </Button>
        <Button icon={<ImportOutlined />} onClick={() => setBulkOpen(true)}>
          Bulk add
        </Button>
      </Space>
      <Modal
        title="Bulk add expected files"
        open={bulkOpen}
        onOk={applyBulk}
        onCancel={() => setBulkOpen(false)}
        okText="Add"
        okButtonProps={{ disabled: !bulkText.trim() }}
      >
        <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
          One file name per line. Each is added as a mandatory item; you can adjust afterwards.
        </Typography.Paragraph>
        <Input.TextArea
          value={bulkText}
          autoSize={{ minRows: 5, maxRows: 14 }}
          placeholder={'DSV_<EDIT number>_JPMBL_1.0_ffid.json\nDSV_<EDIT number>_JPMBL_1.0_frer.json'}
          onChange={(e) => setBulkText(e.target.value)}
        />
      </Modal>
    </Space>
  );
}

/**
 * Compact checklist surface for the narrow details panel: always shows the read-only
 * list, and (for admins) opens a wide modal for comfortable table editing.
 */
function ChecklistEditor({ items, admin, onChange, title }: Readonly<ChecklistEditorProps>) {
  const [open, setOpen] = useState(false);
  const mandatory = items.filter((i) => i.required).length;

  return (
    <Space direction="vertical" size={8} style={{ width: '100%' }}>
      <ChecklistView items={items} />
      {admin && (
        <>
          <Button size="small" icon={<EditOutlined />} onClick={() => setOpen(true)}>
            Edit expected files{items.length > 0 ? ` (${items.length})` : ''}
          </Button>
          <Modal
            title={title ?? 'Expected files'}
            open={open}
            onCancel={() => setOpen(false)}
            width={820}
            footer={[
              <Button key="done" type="primary" onClick={() => setOpen(false)}>
                Done
              </Button>,
            ]}
            styles={{ body: { maxHeight: '65vh', overflow: 'auto', paddingTop: 8 } }}
          >
            {items.length > 0 && (
              <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
                {items.length} file{items.length === 1 ? '' : 's'}
                {mandatory > 0 ? ` · ${mandatory} mandatory` : ''}
              </Typography.Paragraph>
            )}
            <ChecklistTable items={items} onChange={onChange} />
          </Modal>
        </>
      )}
    </Space>
  );
}

interface FolderDetailsProps {
  node: EditNode;
  admin: boolean;
  path: string[] | null;
  isRoot?: boolean;
  onPatch: (patch: Partial<EditNode>) => void;
  onAddSubfolder: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}

function FolderDetails({
  node,
  admin,
  path,
  isRoot = false,
  onPatch,
  onAddSubfolder,
  onMoveUp,
  onMoveDown,
  onDelete,
}: Readonly<FolderDetailsProps>) {
  const purpose = node.description?.trim();

  const renderPurpose = () => {
    if (admin) {
      return (
        <Input.TextArea
          value={node.description ?? ''}
          maxLength={400}
          showCount
          autoSize={{ minRows: 3, maxRows: 10 }}
          placeholder="What this folder is used for"
          style={{ marginBottom: 18 }}
          onChange={(e) => onPatch({ description: e.target.value })}
        />
      );
    }
    if (purpose) {
      return (
        <Typography.Paragraph style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>
          {purpose}
        </Typography.Paragraph>
      );
    }
    return (
      <Typography.Text type="secondary" italic>
        No purpose has been set for this folder.
      </Typography.Text>
    );
  };

  return (
    <Card size="small" title={isRoot ? 'Root details' : 'Folder details'}>
      <Space direction="vertical" size="small" style={{ width: '100%' }}>
        {!isRoot && path && path.length > 0 && (
          <Breadcrumb style={{ fontSize: 12 }} items={path.map((p) => ({ title: p }))} />
        )}
        <div>
          <Typography.Text type="secondary">{isRoot ? 'Root (template name)' : 'Folder name'}</Typography.Text>
          {admin && !isRoot ? (
            <Input
              value={node.name}
              maxLength={200}
              onChange={(e) => onPatch({ name: e.target.value })}
            />
          ) : (
            <div>
              <Typography.Text strong>{node.name.trim() || '(unnamed)'}</Typography.Text>
              {isRoot && (
                <Typography.Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                  edited in “Name” above
                </Typography.Text>
              )}
            </div>
          )}
        </div>
        <div>
          <Typography.Text type="secondary">Purpose</Typography.Text>
          {renderPurpose()}
        </div>
        <div>
          <Typography.Text type="secondary">
            {isRoot
              ? 'Checklist (files expected at the top level)'
              : 'Checklist (files expected in this folder)'}
          </Typography.Text>
          <ChecklistEditor
            items={node.checklist}
            admin={admin}
            onChange={(items) => onPatch({ checklist: items })}
            title={
              isRoot
                ? 'Expected files — template root'
                : `Expected files — ${node.name.trim() || '(unnamed folder)'}`
            }
          />
        </div>
        {admin && (
          <Space wrap>
            <Button size="small" icon={<FolderAddOutlined />} onClick={onAddSubfolder}>
              {isRoot ? 'Add root folder' : 'Add subfolder'}
            </Button>
            {!isRoot && (
              <>
                <Button size="small" icon={<ArrowUpOutlined />} onClick={onMoveUp}>
                  Up
                </Button>
                <Button size="small" icon={<ArrowDownOutlined />} onClick={onMoveDown}>
                  Down
                </Button>
                <Popconfirm title="Delete this folder and its subfolders?" onConfirm={onDelete}>
                  <Button size="small" danger icon={<DeleteOutlined />}>
                    Delete
                  </Button>
                </Popconfirm>
              </>
            )}
          </Space>
        )}
      </Space>
    </Card>
  );
}

export function DirectoryTemplatesPage() {
  const { message } = AntApp.useApp();
  const queryClient = useQueryClient();
  const admin = !!useAuthStore((s) => s.user);

  const [selectedId, setSelectedId] = useState<number | 'new' | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [tree, setTree] = useState<EditNode[]>([]);
  const [rootChecklist, setRootChecklist] = useState<TemplateChecklistItem[]>([]);
  const [selectedNodeKey, setSelectedNodeKey] = useState<string | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [updateOpen, setUpdateOpen] = useState(false);
  const [updateText, setUpdateText] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [savedSignature, setSavedSignature] = useState(EMPTY_SIGNATURE);
  const [recoverable, setRecoverable] = useState<TemplateDraft | null>(null);

  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: fetchTemplates,
  });

  const { data: detail, isFetching: detailLoading } = useQuery({
    queryKey: ['templates', selectedId],
    queryFn: () => fetchTemplate(selectedId as number),
    enabled: typeof selectedId === 'number',
  });

  // Load the selected template into the editable draft.
  useEffect(() => {
    if (selectedId === 'new') {
      setName('');
      setDescription('');
      setIsDefault(false);
      setTree([]);
      setRootChecklist([]);
      setSelectedNodeKey(null);
      setExpandedKeys([ROOT_KEY]);
      setSavedSignature(EMPTY_SIGNATURE);
      const draft = readDraft('new');
      setRecoverable(draft && draft.signature !== EMPTY_SIGNATURE ? draft : null);
      return;
    }
    if (detail && detail.id === selectedId) {
      const editTree = toEditTree(detail.nodes);
      setName(detail.name);
      setDescription(detail.description ?? '');
      setIsDefault(detail.isDefault);
      setTree(editTree);
      setRootChecklist((detail.checklist ?? []).map((c) => ({ ...c })));
      setSelectedNodeKey(null);
      setExpandedKeys([ROOT_KEY, ...collectKeys(editTree)]);
      const sig = serverSignature(detail);
      setSavedSignature(sig);
      const draft = readDraft(detail.id);
      if (draft && draft.signature !== sig) {
        setRecoverable(draft);
      } else {
        setRecoverable(null);
        if (draft) clearDraft(detail.id);
      }
    }
  }, [detail, selectedId]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['templates'] });

  const buildPayload = (): TemplatePayload => ({
    name: name.trim(),
    description: description.trim() ? description.trim() : null,
    isDefault,
    nodes: toInput(tree),
    checklist: cleanChecklist(rootChecklist),
  });
  const currentSignature = JSON.stringify(buildPayload());
  const dirty = currentSignature !== savedSignature;
  const validationError = (): 'name' | 'folder' | null => {
    if (!name.trim()) return 'name';
    if (collectKeys(tree).some((k) => !findNode(tree, k)!.name.trim())) return 'folder';
    return null;
  };

  const save = useMutation({
    mutationFn: (payload: TemplatePayload) =>
      selectedId === 'new'
        ? createTemplate(payload)
        : updateTemplate(selectedId as number, payload),
    onSuccess: (saved, payload) => {
      const prevId = selectedIdRef.current;
      clearDraft(prevId);
      clearDraft(saved.id);
      message.success('Template saved');
      if (prevId === 'new') {
        invalidate();
        setSelectedId(saved.id);
      } else {
        // Don't touch the detail cache: rewriting it re-fires the load effect and
        // clears the current folder selection. Baseline the sent payload instead.
        queryClient.invalidateQueries({ queryKey: ['templates'], exact: true });
        setSavedSignature(JSON.stringify(payload));
      }
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to save template')),
  });

  // Silent auto-save fired on natural editing boundaries (folder/template switch, window blur).
  const autoCommit = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: TemplatePayload }) =>
      updateTemplate(id, payload),
    onSuccess: (_saved, { id, payload }) => {
      clearDraft(id);
      // Refresh only the left-hand list; leave the editor's selection/keys untouched.
      queryClient.invalidateQueries({ queryKey: ['templates'], exact: true });
      if (selectedIdRef.current === id) setSavedSignature(JSON.stringify(payload));
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Auto-save failed')),
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteTemplate(id),
    onSuccess: () => {
      message.success('Template deleted');
      setSelectedId(null);
      invalidate();
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to delete template')),
  });

  const runImport = useMutation({
    mutationFn: (payload: TemplatePayload) => importTemplate(payload),
    onSuccess: (saved) => {
      message.success(`Imported "${saved.name}"`);
      setImportOpen(false);
      setImportText('');
      invalidate();
      setSelectedId(saved.id);
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to import template')),
  });

  const runExport = useMutation({
    mutationFn: (id: number) => exportTemplate(id),
    onSuccess: (payload) => {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${(payload.name || 'template').replace(/[^\w.-]+/g, '_')}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      message.success('Template exported');
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to export template')),
  });

  const runUpdate = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: TemplatePayload }) =>
      updateTemplateFromImport(id, payload),
    onSuccess: (saved) => {
      message.success(`Updated "${saved.name}"`);
      setUpdateOpen(false);
      setUpdateText('');
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['templates', saved.id] });
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to update template')),
  });

  const parsePayload = (text: string): TemplatePayload | null => {
    let payload: TemplatePayload;
    try {
      payload = JSON.parse(text) as TemplatePayload;
    } catch {
      message.error('Invalid JSON');
      return null;
    }
    if (!payload || typeof payload.name !== 'string' || !payload.name.trim()) {
      message.error('JSON must include a non-empty "name"');
      return null;
    }
    return payload;
  };

  const submitImport = () => {
    const payload = parsePayload(importText);
    if (payload) runImport.mutate(payload);
  };

  const submitUpdate = () => {
    if (typeof selectedId !== 'number') return;
    const payload = parsePayload(updateText);
    if (payload) runUpdate.mutate({ id: selectedId, payload });
  };

  const treeData = useMemo<DataNode[]>(
    () => [
      {
        key: ROOT_KEY,
        icon: <FolderOutlined />,
        title: (
          <span>
            {name.trim() || 'Template root'}{' '}
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              (root)
            </Typography.Text>
          </span>
        ),
        children: toTreeData(tree),
      },
    ],
    [tree, name],
  );
  const isRootSelected = selectedNodeKey === ROOT_KEY;
  const selectedNode = selectedNodeKey && !isRootSelected ? findNode(tree, selectedNodeKey) : null;
  const nodePath = selectedNode ? findPath(tree, selectedNode.key) : null;
  const missingPurposeCount = useMemo(() => countMissingPurpose(tree), [tree]);

  const rootNode: EditNode = {
    key: ROOT_KEY,
    name: name.trim() || 'Template root',
    description,
    children: tree,
    checklist: rootChecklist,
  };
  const patchRoot = (patch: Partial<EditNode>) => {
    if (patch.description !== undefined) setDescription(patch.description ?? '');
    if (patch.checklist !== undefined) setRootChecklist(patch.checklist);
  };

  const patchNode = (key: string, patch: Partial<EditNode>) =>
    setTree((prev) => mapNode(prev, key, (n) => ({ ...n, ...patch })));

  const handleAddFolder = (parentKey: string | null) => {
    const node: EditNode = { key: nextKey(), name: 'New folder', description: undefined, children: [], checklist: [] };
    setTree((prev) => addChild(prev, parentKey, node));
    setExpandedKeys((k) => Array.from(new Set([...k, parentKey ?? ROOT_KEY])));
    setSelectedNodeKey(node.key);
  };

  const handleDeleteNode = (key: string) => {
    setTree((prev) => removeNode(prev, key));
    if (selectedNodeKey === key) setSelectedNodeKey(null);
  };

  const handleSave = () => {
    if (!name.trim()) {
      message.error('Template name is required');
      return;
    }
    if (collectKeys(tree).some((k) => !findNode(tree, k)!.name.trim())) {
      message.error('Every folder must have a name');
      return;
    }
    save.mutate({
      name: name.trim(),
      description: description.trim() ? description.trim() : null,
      isDefault,
      nodes: toInput(tree),
      checklist: cleanChecklist(rootChecklist),
    });
  };

  // Commit the current draft to the server at natural boundaries, when valid and changed.
  const commitRef = useRef<() => void>(() => {});
  commitRef.current = () => {
    if (!admin || typeof selectedId !== 'number' || !dirty) return;
    if (autoCommit.isPending || save.isPending || validationError()) return;
    autoCommit.mutate({ id: selectedId, payload: buildPayload() });
  };

  // Synchronously persist an unsaved draft to localStorage (used on tab close).
  const flushDraftRef = useRef<() => void>(() => {});
  flushDraftRef.current = () => {
    if (!admin || selectedId == null || !dirty) return;
    writeDraft(selectedId, { payload: buildPayload(), signature: currentSignature, ts: Date.now() });
  };

  useEffect(() => {
    const onBlur = () => commitRef.current();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        flushDraftRef.current();
        commitRef.current();
      }
    };
    const onBeforeUnload = () => flushDraftRef.current();
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, []);

  // Keep a lightweight local draft so nothing is lost on an accidental refresh.
  useEffect(() => {
    if (!admin || selectedId == null) return;
    if (!dirty) {
      clearDraft(selectedId);
      return;
    }
    const timer = setTimeout(() => {
      writeDraft(selectedId, { payload: buildPayload(), signature: currentSignature, ts: Date.now() });
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSignature, dirty, selectedId, admin]);

  const selectTemplate = (id: number | 'new') => {
    commitRef.current();
    setSelectedId(id);
  };

  const applyDraft = () => {
    if (!recoverable) return;
    const d = recoverable.payload;
    setName(d.name);
    setDescription(d.description ?? '');
    setIsDefault(d.isDefault);
    const editTree = inputToEditTree(d.nodes ?? []);
    setTree(editTree);
    setRootChecklist((d.checklist ?? []).map((c) => ({ ...c })));
    setExpandedKeys([ROOT_KEY, ...collectKeys(editTree)]);
    setSelectedNodeKey(null);
    setRecoverable(null);
  };

  const discardDraft = () => {
    if (selectedId != null) clearDraft(selectedId);
    setRecoverable(null);
  };

  const statusTag = (() => {
    if (autoCommit.isPending || save.isPending) {
      return (
        <Tag icon={<LoadingOutlined />} color="processing">
          Saving…
        </Tag>
      );
    }
    if (!dirty) {
      return (
        <Tag icon={<CheckCircleOutlined />} color="success">
          All changes saved
        </Tag>
      );
    }
    if (validationError()) {
      return (
        <Tag icon={<WarningOutlined />} color="warning">
          Unsaved · complete required fields
        </Tag>
      );
    }
    return (
      <Tag icon={<WarningOutlined />} color="gold">
        Unsaved changes
      </Tag>
    );
  })();


  const buildMarkdown = () => templateToMarkdown(name, description, tree);

  const copyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(buildMarkdown());
      message.success('Copied as Markdown');
    } catch {
      message.error('Copy failed');
    }
  };

  const downloadMarkdown = () => {
    const blob = new Blob([buildMarkdown()], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${(name || 'template').replace(/[^\w.-]+/g, '_')}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 16 }}>
        Directory Templates
      </Typography.Title>
      <Row gutter={16}>
        <Col xs={24} lg={8}>
          <Card
            size="small"
            title="Templates"
            extra={
              admin && (
                <Space size="small">
                  <Button
                    size="small"
                    icon={<ImportOutlined />}
                    onClick={() => {
                      setImportText('');
                      setImportOpen(true);
                    }}
                  >
                    Import
                  </Button>
                  <Button
                    size="small"
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => selectTemplate('new')}
                  >
                    New
                  </Button>
                </Space>
              )
            }
          >
            <List
              size="small"
              loading={isLoading}
              dataSource={templates}
              locale={{ emptyText: 'No templates yet' }}
              renderItem={(t) => (
                <List.Item
                  style={{ cursor: 'pointer', background: t.id === selectedId ? 'rgba(22,119,255,0.08)' : undefined }}
                  onClick={() => selectTemplate(t.id)}
                >
                  <List.Item.Meta
                    title={
                      <Space>
                        {t.name}
                        {t.isDefault && <Tag color="gold">default</Tag>}
                      </Space>
                    }
                    description={t.description || undefined}
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>

        <Col xs={24} lg={16}>
          {(() => {
            if (selectedId == null) {
              return (
                <Card>
                  <Empty description="Select a template to view its directory structure, or create a new one." />
                </Card>
              );
            }
            if (detailLoading && selectedId !== 'new') {
              return (
                <Card>
                  <Spin />
                </Card>
              );
            }
            return (
            <Card
              title={selectedId === 'new' ? 'New template' : 'Edit template'}
              extra={
                <Space>
                  {admin && statusTag}
                  {selectedId !== 'new' && (
                    <Button icon={<FileTextOutlined />} onClick={() => setPreviewOpen(true)}>
                      Preview
                    </Button>
                  )}
                  {admin && typeof selectedId === 'number' && (
                    <>
                      <Button
                        icon={<DownloadOutlined />}
                        loading={runExport.isPending}
                        onClick={() => runExport.mutate(selectedId)}
                      >
                        Export
                      </Button>
                      <Button
                        icon={<ImportOutlined />}
                        onClick={() => {
                          setUpdateText('');
                          setUpdateOpen(true);
                        }}
                      >
                        Update from JSON
                      </Button>
                      <Popconfirm
                        title="Delete this template?"
                        description="Artifacts already created keep their folders."
                        onConfirm={() => remove.mutate(selectedId)}
                      >
                        <Button danger icon={<DeleteOutlined />}>
                          Delete
                        </Button>
                      </Popconfirm>
                    </>
                  )}
                  {admin && (
                    <Button
                      type="primary"
                      icon={<SaveOutlined />}
                      loading={save.isPending}
                      onClick={handleSave}
                    >
                      Save
                    </Button>
                  )}
                </Space>
              }
            >
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                {recoverable && (
                  <Alert
                    type="warning"
                    showIcon
                    message="Unsaved draft found"
                    description={`A local draft from ${new Date(recoverable.ts).toLocaleString()} was never saved to the server.`}
                    action={
                      <Space>
                        <Button size="small" type="primary" onClick={applyDraft}>
                          Restore
                        </Button>
                        <Button size="small" onClick={discardDraft}>
                          Discard
                        </Button>
                      </Space>
                    }
                  />
                )}
                <div>
                  <Typography.Text type="secondary">Name</Typography.Text>
                  <Input
                    value={name}
                    disabled={!admin}
                    maxLength={120}
                    placeholder="Template name"
                    onChange={(e) => setName(e.target.value)}
                    onBlur={() => commitRef.current()}
                  />
                </div>
                <Space>
                  <Switch checked={isDefault} disabled={!admin} onChange={setIsDefault} />
                  <Typography.Text>Use as default when creating artifacts</Typography.Text>
                </Space>
              </Space>

              <Divider orientation="left" style={{ marginTop: 20 }}>
                <Space size="small">
                  Folders
                  {missingPurposeCount > 0 && (
                    <Tooltip title="Folders without a purpose description">
                      <Tag color="orange">{missingPurposeCount} missing purpose</Tag>
                    </Tooltip>
                  )}
                </Space>
              </Divider>

              <Row gutter={16}>
                <Col xs={24} md={13}>
                  {admin && (
                    <Button
                      size="small"
                      icon={<FolderAddOutlined />}
                      style={{ marginBottom: 8 }}
                      onClick={() => handleAddFolder(null)}
                    >
                      Add root folder
                    </Button>
                  )}
                  <Tree
                    showIcon
                    blockNode
                    selectedKeys={selectedNodeKey ? [selectedNodeKey] : []}
                    expandedKeys={expandedKeys}
                    onExpand={(keys) => setExpandedKeys(keys as string[])}
                    treeData={treeData}
                    onSelect={(keys) => {
                      setSelectedNodeKey((keys[0] as string) ?? null);
                      commitRef.current();
                    }}
                  />
                </Col>

                <Col xs={24} md={11}>
                  {isRootSelected ? (
                    <FolderDetails
                      node={rootNode}
                      admin={admin}
                      isRoot
                      path={null}
                      onPatch={patchRoot}
                      onAddSubfolder={() => handleAddFolder(null)}
                      onMoveUp={() => {}}
                      onMoveDown={() => {}}
                      onDelete={() => {}}
                    />
                  ) : selectedNode ? (
                    <FolderDetails
                      node={selectedNode}
                      admin={admin}
                      path={nodePath}
                      onPatch={(patch) => patchNode(selectedNode.key, patch)}
                      onAddSubfolder={() => handleAddFolder(selectedNode.key)}
                      onMoveUp={() => setTree((p) => moveSibling(p, selectedNode.key, -1))}
                      onMoveDown={() => setTree((p) => moveSibling(p, selectedNode.key, 1))}
                      onDelete={() => handleDeleteNode(selectedNode.key)}
                    />
                  ) : (
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description="Select the root or a folder to edit its purpose and checklist"
                    />
                  )}
                </Col>
              </Row>
            </Card>
            );
          })()}
        </Col>
      </Row>

      <Modal
        open={importOpen}
        title="Import template from JSON"
        okText="Import"
        confirmLoading={runImport.isPending}
        onCancel={() => setImportOpen(false)}
        onOk={submitImport}
        width={640}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Upload.Dragger
            accept=".json,application/json"
            showUploadList={false}
            beforeUpload={(file) => {
              file.text().then((text) => setImportText(text));
              return false;
            }}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">Drag a JSON file here, or click to browse</p>
          </Upload.Dragger>
          <Input.TextArea
            rows={14}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder='{ "name": "...", "nodes": [ ... ] }'
          />
          <Typography.Text type="secondary">
            A new template is created; it is never set as default on import. See the README for the full schema.
          </Typography.Text>
        </Space>
      </Modal>

      <Modal
        open={updateOpen}
        title="Update template from JSON"
        okText="Update"
        confirmLoading={runUpdate.isPending}
        onCancel={() => setUpdateOpen(false)}
        onOk={submitUpdate}
        width={640}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Upload.Dragger
            accept=".json,application/json"
            showUploadList={false}
            beforeUpload={(file) => {
              file.text().then((text) => setUpdateText(text));
              return false;
            }}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">Drag a JSON file here, or click to browse</p>
          </Upload.Dragger>
          <Input.TextArea
            rows={14}
            value={updateText}
            onChange={(e) => setUpdateText(e.target.value)}
            placeholder='{ "name": "...", "nodes": [ ... ] }'
          />
          <Typography.Text type="secondary">
            Replaces this template's name, description and entire folder tree.
          </Typography.Text>
        </Space>
      </Modal>

      <Modal
        open={previewOpen}
        title="Directory documentation"
        width={720}
        onCancel={() => setPreviewOpen(false)}
        footer={[
          <Button key="copy" icon={<CopyOutlined />} onClick={copyMarkdown}>
            Copy as Markdown
          </Button>,
          <Button key="download" icon={<DownloadOutlined />} onClick={downloadMarkdown}>
            Download .md
          </Button>,
          <Button key="close" type="primary" onClick={() => setPreviewOpen(false)}>
            Close
          </Button>,
        ]}
      >
        <div style={{ maxHeight: '60vh', overflow: 'auto' }}>
          <Typography.Title level={5} style={{ marginTop: 0 }}>
            {name.trim() || 'Untitled template'}
          </Typography.Title>
          {description.trim() && (
            <Typography.Paragraph type="secondary">{description.trim()}</Typography.Paragraph>
          )}
          {tree.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No folders defined" />
          ) : (
            <DocNodes nodes={tree} />
          )}
        </div>
      </Modal>
    </div>
  );
}
