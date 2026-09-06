import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  updateVar,
  type Variable,
  type VarTable,
} from '../../api/vars';
import { extractErrorMessage } from '../../api/client';

interface VariablesPanelProps {
  artifactId: number;
}

// null = not editing; 'new' = creating a table; number = renaming that table
type TableEditId = number | 'new' | null;

const NEW_TAB_KEY = '__new__';
const ADD_ROW_ID = -1;

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
            />
          );
        }
        return <Typography.Text strong>{k}</Typography.Text>;
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
            />
          );
        }
        return (
          <Typography.Text style={{ wordBreak: 'break-all' }}>{v}</Typography.Text>
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
        <Button
          size="small"
          icon={<PlusOutlined />}
          disabled={tableEditId !== null}
          onClick={startNewTable}
        >
          New table
        </Button>
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
          <Table<Variable>
            size="small"
            rowKey="id"
            loading={varsLoading || tablesLoading}
            columns={columns}
            dataSource={adding ? [...vars, { id: ADD_ROW_ID, keyName: '', value: '' } as Variable] : vars}
            pagination={false}
            locale={{
              emptyText: (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No variables in this table" />
              ),
            }}
          />
        </>
      )}
    </Card>
  );
}
