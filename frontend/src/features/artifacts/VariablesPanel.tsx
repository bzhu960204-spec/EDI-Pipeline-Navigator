import {
  cloneElement,
  createContext,
  type FocusEvent,
  type KeyboardEvent,
  type ReactElement,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  type DraggableSyntheticListeners,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  App as AntApp,
  Button,
  Card,
  Empty,
  Input,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tabs,
  Tooltip,
  Typography,
} from 'antd';
import type { InputRef } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CheckOutlined,
  CloseOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  HolderOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import {
  createVar,
  createVarTable,
  deleteVar,
  deleteVarTable,
  fetchVars,
  fetchVarTables,
  renameVarTable,
  reorderVars,
  reorderVarTables,
  updateVar,
  type Variable,
  type VarTable,
} from '../../api/vars';
import { extractErrorMessage } from '../../api/client';
import { VarTemplateTools } from './VarTemplateTools';

interface VariablesPanelProps {
  artifactId: number;
}

// null = not editing; 'new' = creating a table; number = renaming that table
type TableEditId = number | 'new' | null;

const NEW_TAB_KEY = '__new__';
const ADD_ROW_ID = -1;

function arrayMove<T>(items: T[], from: number, to: number): T[] {
  const next = items.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

// Wraps an Ant tab node so it can be dragged horizontally to reorder tables.
function DraggableTabNode({
  id,
  disabled,
  children,
}: Readonly<{ id: string; disabled: boolean; children: ReactElement }>) {
  const { attributes, listeners, setNodeRef: setDrag, transform, isDragging } = useDraggable({
    id,
    disabled,
  });
  const { setNodeRef: setDrop, isOver } = useDroppable({ id, disabled });
  const setRefs = (node: HTMLElement | null) => {
    setDrag(node);
    setDrop(node);
  };
  const style = {
    ...(children.props as { style?: React.CSSProperties }).style,
    transform: transform ? `translateX(${transform.x}px)` : undefined,
    opacity: isDragging ? 0.6 : 1,
    cursor: disabled ? undefined : 'grab',
    ...(isOver && !isDragging ? { outline: '1px dashed #1677ff', outlineOffset: -2 } : {}),
  };
  return cloneElement(children, {
    ref: setRefs,
    style,
    ...(disabled ? {} : listeners),
    ...attributes,
  } as Record<string, unknown>);
}

const RowContext = createContext<{
  listeners?: DraggableSyntheticListeners;
  setActivatorNodeRef?: (element: HTMLElement | null) => void;
}>({});

function DragHandle() {
  const { listeners, setActivatorNodeRef } = useContext(RowContext);
  return (
    <Button
      type="text"
      size="small"
      ref={setActivatorNodeRef}
      icon={<HolderOutlined />}
      style={{ cursor: 'grab' }}
      {...(listeners ?? {})}
    />
  );
}

// A draggable table row keyed by its `data-row-key`; drag is initiated from the handle only.
function DraggableRow(
  props: Readonly<React.HTMLAttributes<HTMLTableRowElement> & { 'data-row-key': string }>,
) {
  const rowKey = props['data-row-key'];
  const enabled = rowKey !== String(ADD_ROW_ID);
  const {
    attributes,
    listeners,
    setNodeRef: setDrag,
    setActivatorNodeRef,
    transform,
    isDragging,
  } = useDraggable({ id: rowKey, disabled: !enabled });
  const { setNodeRef: setDrop, isOver } = useDroppable({ id: rowKey, disabled: !enabled });
  const setRefs = (node: HTMLTableRowElement | null) => {
    setDrag(node);
    setDrop(node);
  };
  const style: React.CSSProperties = {
    ...props.style,
    ...(transform
      ? { transform: `translateY(${transform.y}px)`, position: 'relative', zIndex: isDragging ? 2 : undefined }
      : {}),
    ...(isOver && !isDragging ? { background: 'rgba(22, 119, 255, 0.12)' } : {}),
  };
  const ctx = useMemo(() => ({ listeners, setActivatorNodeRef }), [listeners, setActivatorNodeRef]);
  return (
    <RowContext.Provider value={ctx}>
      <tr {...props} {...attributes} ref={setRefs} style={style} />
    </RowContext.Provider>
  );
}


export function VariablesPanel({ artifactId }: Readonly<VariablesPanelProps>) {
  const { message } = AntApp.useApp();
  const queryClient = useQueryClient();
  const [activeTableId, setActiveTableId] = useState<number | null>(null);
  const [tableEditId, setTableEditId] = useState<TableEditId>(null);
  const [tableDraft, setTableDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const [addKey, setAddKey] = useState('');
  const [addValue, setAddValue] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editKey, setEditKey] = useState('');
  const [editValue, setEditValue] = useState('');
  const addKeyRef = useRef<InputRef>(null);

  const tablesKey = ['artifacts', artifactId, 'var-tables'];

  const { data: tables = [], isLoading: tablesLoading } = useQuery({
    queryKey: tablesKey,
    queryFn: () => fetchVarTables(artifactId),
    enabled: Number.isFinite(artifactId),
  });

  // Keep a valid table selected as the list changes.
  useEffect(() => {
    if (tables.length === 0) {
      setActiveTableId(null);
    } else if (activeTableId === null || !tables.some((t) => t.id === activeTableId)) {
      setActiveTableId(tables[0].id);
    }
  }, [tables, activeTableId]);

  const varsKey = ['artifacts', artifactId, 'var-tables', activeTableId, 'vars'];

  const { data: vars = [], isLoading: varsLoading } = useQuery({
    queryKey: varsKey,
    queryFn: () => fetchVars(artifactId, activeTableId as number),
    enabled: Number.isFinite(artifactId) && activeTableId !== null,
  });

  const invalidateTables = () => queryClient.invalidateQueries({ queryKey: tablesKey });
  const invalidateVars = () =>
    queryClient.invalidateQueries({ queryKey: ['artifacts', artifactId, 'var-tables', activeTableId, 'vars'] });

  const saveTable = useMutation({
    mutationFn: ({ id, name }: { id: number | 'new'; name: string }) =>
      id === 'new'
        ? createVarTable(artifactId, { name })
        : renameVarTable(artifactId, id, { name }),
    onSuccess: (saved) => {
      invalidateTables();
      setActiveTableId(saved.id);
      setTableEditId(null);
      setTableDraft('');
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to save table')),
  });

  const removeTable = useMutation({
    mutationFn: (id: number) => deleteVarTable(artifactId, id),
    onSuccess: () => invalidateTables(),
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to delete table')),
  });

  const saveVar = useMutation({
    mutationFn: (input: { id: number | null; keyName: string; value: string }) =>
      input.id == null
        ? createVar(artifactId, activeTableId as number, { keyName: input.keyName, value: input.value })
        : updateVar(artifactId, activeTableId as number, input.id, { keyName: input.keyName, value: input.value }),
    onSuccess: (_saved, input) => {
      invalidateVars();
      if (input.id == null) {
        // Keep the add row open for fast consecutive entry.
        setAddKey('');
        setAddValue('');
        addKeyRef.current?.focus();
      } else {
        setEditingId(null);
      }
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to save variable')),
  });

  const removeVar = useMutation({
    mutationFn: (id: number) => deleteVar(artifactId, activeTableId as number, id),
    onSuccess: () => invalidateVars(),
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to delete variable')),
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const reorderTables = useMutation({
    mutationFn: (orderedIds: number[]) => reorderVarTables(artifactId, orderedIds),
    onMutate: async (orderedIds) => {
      await queryClient.cancelQueries({ queryKey: tablesKey });
      const prev = queryClient.getQueryData<VarTable[]>(tablesKey);
      queryClient.setQueryData<VarTable[]>(tablesKey, (old) => {
        if (!old) return old;
        const byId = new Map(old.map((t) => [t.id, t]));
        return orderedIds.map((id) => byId.get(id)).filter((t): t is VarTable => t != null);
      });
      return { prev };
    },
    onError: (e, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(tablesKey, ctx.prev);
      message.error(extractErrorMessage(e, 'Failed to reorder tables'));
    },
    onSettled: () => invalidateTables(),
  });

  const reorderVarRows = useMutation({
    mutationFn: (orderedIds: number[]) => reorderVars(artifactId, activeTableId as number, orderedIds),
    onMutate: async (orderedIds) => {
      await queryClient.cancelQueries({ queryKey: varsKey });
      const prev = queryClient.getQueryData<Variable[]>(varsKey);
      queryClient.setQueryData<Variable[]>(varsKey, (old) => {
        if (!old) return old;
        const byId = new Map(old.map((v) => [v.id, v]));
        return orderedIds.map((id) => byId.get(id)).filter((v): v is Variable => v != null);
      });
      return { prev };
    },
    onError: (e, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(varsKey, ctx.prev);
      message.error(extractErrorMessage(e, 'Failed to reorder variables'));
    },
    onSettled: () => invalidateVars(),
  });

  const onTabDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const ids = tables.map((t) => t.id);
    const from = ids.indexOf(Number(active.id));
    const to = ids.indexOf(Number(over.id));
    if (from < 0 || to < 0) return;
    reorderTables.mutate(arrayMove(ids, from, to));
  };

  const onVarDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const ids = vars.map((v) => v.id);
    const from = ids.indexOf(Number(active.id));
    const to = ids.indexOf(Number(over.id));
    if (from < 0 || to < 0) return;
    reorderVarRows.mutate(arrayMove(ids, from, to));
  };

  const startAdd = () => {
    setEditingId(null);
    setAddKey('');
    setAddValue('');
    setAdding(true);
  };
  const cancelAdd = () => {
    setAdding(false);
    setAddKey('');
    setAddValue('');
  };
  const submitAdd = () => {
    const keyName = addKey.trim();
    if (!keyName) {
      message.error('Key is required');
      return;
    }
    saveVar.mutate({ id: null, keyName, value: addValue });
  };

  const startEdit = (row: Variable) => {
    setAdding(false);
    setEditingId(row.id);
    setEditKey(row.keyName);
    setEditValue(row.value ?? '');
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditKey('');
    setEditValue('');
  };
  const submitEdit = () => {
    const keyName = editKey.trim();
    if (!keyName) {
      message.error('Key is required');
      return;
    }
    if (editingId != null) saveVar.mutate({ id: editingId, keyName, value: editValue });
  };

  const startRename = (t: VarTable) => {
    setTableEditId(t.id);
    setTableDraft(t.name);
  };
  const startNewTable = () => {
    setTableEditId('new');
    setTableDraft('');
  };
  const cancelTableEdit = () => {
    setTableEditId(null);
    setTableDraft('');
  };
  const submitTableEdit = () => {
    const name = tableDraft.trim();
    if (!name) {
      message.error('Name is required');
      return;
    }
    if (tableEditId != null) saveTable.mutate({ id: tableEditId, name });
  };

  // Enter submits, Shift+Enter inserts a newline, Escape cancels.
  const rowKeyDown = (
    e: KeyboardEvent<HTMLElement>,
    submit: () => void,
    cancel: () => void,
  ) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  };

  // Commit an in-progress edit when focus leaves the row; keep editing when focus
  // moves to the other field or the save/cancel buttons within the same row.
  const commitEditOnBlur = (e: FocusEvent<HTMLElement>) => {
    const row = e.currentTarget.closest('tr');
    const next = e.relatedTarget as HTMLElement | null;
    if (next && row && row.contains(next)) return;
    if (editKey.trim()) submitEdit();
    else cancelEdit();
  };

  const copyValue = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value ?? '');
      message.success('Value copied');
    } catch {
      message.error('Copy failed');
    }
  };

  const activeTable = useMemo(
    () => tables.find((t) => t.id === activeTableId) ?? null,
    [tables, activeTableId],
  );

  const columns: ColumnsType<Variable> = [
    {
      title: '',
      key: 'sort',
      width: 36,
      render: (_, row) =>
        row.id === ADD_ROW_ID || row.id === editingId || adding ? null : <DragHandle />,
    },
    {
      title: 'Key',
      dataIndex: 'keyName',
      width: '32%',
      render: (k: string, row) => {
        if (row.id === ADD_ROW_ID) {
          return (
            <Input
              ref={addKeyRef}
              size="small"
              autoFocus
              value={addKey}
              placeholder="e.g. ROUTE_RULE_ID"
              maxLength={200}
              onChange={(e) => setAddKey(e.target.value)}
              onKeyDown={(e) => rowKeyDown(e, submitAdd, cancelAdd)}
            />
          );
        }
        if (row.id === editingId) {
          return (
            <Input
              size="small"
              autoFocus
              value={editKey}
              maxLength={200}
              onChange={(e) => setEditKey(e.target.value)}
              onKeyDown={(e) => rowKeyDown(e, submitEdit, cancelEdit)}
              onBlur={commitEditOnBlur}
            />
          );
        }
        const busy = adding || editingId !== null;
        return (
          <Typography.Text
            strong
            style={{ cursor: busy ? undefined : 'pointer', display: 'block', minHeight: 22 }}
            onDoubleClick={() => {
              if (!busy) startEdit(row);
            }}
          >
            {k}
          </Typography.Text>
        );
      },
    },
    {
      title: 'Value',
      dataIndex: 'value',
      render: (v: string, row) => {
        if (row.id === ADD_ROW_ID) {
          return (
            <Input.TextArea
              size="small"
              value={addValue}
              placeholder="Value (Shift+Enter for newline)"
              maxLength={2000}
              autoSize={{ minRows: 1, maxRows: 6 }}
              onChange={(e) => setAddValue(e.target.value)}
              onKeyDown={(e) => rowKeyDown(e, submitAdd, cancelAdd)}
            />
          );
        }
        if (row.id === editingId) {
          return (
            <Input.TextArea
              size="small"
              value={editValue}
              maxLength={2000}
              autoSize={{ minRows: 1, maxRows: 6 }}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => rowKeyDown(e, submitEdit, cancelEdit)}
              onBlur={commitEditOnBlur}
            />
          );
        }
        const busy = adding || editingId !== null;
        return (
          <Typography.Text
            style={{ wordBreak: 'break-all', cursor: busy ? undefined : 'pointer', display: 'block', minHeight: 22 }}
            onDoubleClick={() => {
              if (!busy) startEdit(row);
            }}
          >
            {v}
          </Typography.Text>
        );
      },
    },
    {
      title: '',
      key: 'actions',
      width: 120,
      align: 'right',
      render: (_, row) => {
        if (row.id === ADD_ROW_ID) {
          return (
            <Space size={2}>
              <Tooltip title="Add">
                <Button
                  type="text"
                  size="small"
                  icon={<CheckOutlined />}
                  loading={saveVar.isPending}
                  onClick={submitAdd}
                />
              </Tooltip>
              <Tooltip title="Cancel">
                <Button type="text" size="small" icon={<CloseOutlined />} onClick={cancelAdd} />
              </Tooltip>
            </Space>
          );
        }
        if (row.id === editingId) {
          return (
            <Space size={2}>
              <Tooltip title="Save">
                <Button
                  type="text"
                  size="small"
                  icon={<CheckOutlined />}
                  loading={saveVar.isPending}
                  onClick={submitEdit}
                />
              </Tooltip>
              <Tooltip title="Cancel">
                <Button type="text" size="small" icon={<CloseOutlined />} onClick={cancelEdit} />
              </Tooltip>
            </Space>
          );
        }
        const busy = adding || editingId !== null;
        return (
          <Space size={2}>
            <Tooltip title="Copy value">
              <Button
                type="text"
                size="small"
                icon={<CopyOutlined />}
                onClick={() => copyValue(row.value)}
              />
            </Tooltip>
            <Tooltip title="Edit">
              <Button
                type="text"
                size="small"
                icon={<EditOutlined />}
                disabled={busy}
                onClick={() => startEdit(row)}
              />
            </Tooltip>
            <Popconfirm
              title="Delete this variable?"
              onConfirm={() => removeVar.mutate(row.id)}
              okButtonProps={{ danger: true }}
            >
              <Button type="text" size="small" danger icon={<DeleteOutlined />} disabled={busy} />
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  let activeKey: string | undefined;
  if (tableEditId === 'new') {
    activeKey = NEW_TAB_KEY;
  } else if (activeTableId) {
    activeKey = String(activeTableId);
  }

  const tabItems = tables.map((t: VarTable) => ({
    key: String(t.id),
    label:
      tableEditId === t.id ? (
        <Input
          size="small"
          autoFocus
          variant="borderless"
          value={tableDraft}
          maxLength={120}
          style={{ width: 120 }}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setTableDraft(e.target.value)}
          onKeyDown={(e) => rowKeyDown(e, submitTableEdit, cancelTableEdit)}
        />
      ) : (
        <span onDoubleClick={() => startRename(t)}>{t.name}</span>
      ),
  }));
  if (tableEditId === 'new') {
    tabItems.push({
      key: NEW_TAB_KEY,
      closable: false,
      label: (
        <Input
          size="small"
          autoFocus
          variant="borderless"
          value={tableDraft}
          placeholder="Table name"
          maxLength={120}
          style={{ width: 120 }}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setTableDraft(e.target.value)}
          onKeyDown={(e) => rowKeyDown(e, submitTableEdit, cancelTableEdit)}
        />
      ),
    } as (typeof tabItems)[number]);
  }

  return (
    <Card
      title="Variables"
      styles={{ body: { paddingTop: tables.length ? 0 : 24 } }}
      extra={
        <Space size={4}>
          <VarTemplateTools
            artifactId={artifactId}
            activeTableId={activeTableId}
            activeTableName={activeTable?.name}
            hasTables={tables.length > 0}
            disabled={tableEditId !== null}
          />
          <Button
            size="small"
            icon={<PlusOutlined />}
            disabled={tableEditId !== null}
            onClick={startNewTable}
          >
            New table
          </Button>
        </Space>
      }
    >
      {tables.length === 0 && tableEditId !== 'new' ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="No tables yet — create DEV / QA / PROD to store environment values"
        />
      ) : (
        <>
          <Tabs
            type="editable-card"
            hideAdd
            activeKey={activeKey}
            renderTabBar={(tabBarProps, DefaultTabBar) => (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onTabDragEnd}>
                <DefaultTabBar {...tabBarProps}>
                  {(node) => (
                    <DraggableTabNode
                      key={node.key}
                      id={String(node.key)}
                      disabled={tableEditId !== null || node.key === NEW_TAB_KEY}
                    >
                      {node as ReactElement}
                    </DraggableTabNode>
                  )}
                </DefaultTabBar>
              </DndContext>
            )}
            onChange={(k) => {
              if (k === NEW_TAB_KEY) return;
              setActiveTableId(Number(k));
            }}
            onEdit={(key, action) => {
              if (action === 'remove') {
                const id = Number(key);
                Modal.confirm({
                  title: 'Delete table',
                  content: 'This removes the table and all its key-value pairs. Continue?',
                  okButtonProps: { danger: true },
                  onOk: () => removeTable.mutateAsync(id),
                });
              }
            }}
            items={tabItems}
            tabBarExtraContent={
              activeTable && (
                <Button
                  type="text"
                  size="small"
                  icon={<EditOutlined />}
                  disabled={tableEditId !== null}
                  onClick={() => startRename(activeTable)}
                >
                  Rename
                </Button>
              )
            }
          />
          <div style={{ marginBottom: 12 }}>
            <Button
              type="dashed"
              icon={<PlusOutlined />}
              onClick={startAdd}
              disabled={activeTableId === null || adding || editingId !== null}
            >
              Add variable
            </Button>
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onVarDragEnd}>
            <Table<Variable>
              size="small"
              rowKey="id"
              loading={varsLoading || tablesLoading}
              columns={columns}
              components={{ body: { row: DraggableRow } }}
              dataSource={adding ? [...vars, { id: ADD_ROW_ID, keyName: '', value: '' } as Variable] : vars}
              pagination={false}
              locale={{
                emptyText: (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No variables in this table" />
                ),
              }}
            />
          </DndContext>
        </>
      )}
    </Card>
  );
}
