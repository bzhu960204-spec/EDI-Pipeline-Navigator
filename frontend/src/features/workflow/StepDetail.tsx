import { App as AntApp, Button, Card, Descriptions, Dropdown, Empty, Input, List, Popconfirm, Space, Tabs, Tag, Typography } from 'antd';
import type { MenuProps, TabsProps } from 'antd';
import { useEffect, useRef, useState } from 'react';
import {
  ApartmentOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined,
  DeleteOutlined,
  EditOutlined,
  FlagOutlined,
  MergeCellsOutlined,
  MoreOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import type { StepFlagLevel, StepReview, Transition, WorkflowStep } from '../../api/workflow';
import type { IncomingRef } from './workflowUtils';
import type { EditTransitionGroup } from './TransitionFormModal';
import { STEP_FLAG_META, flagMeta } from './stepFlag';

interface StepDetailProps {
  step: WorkflowStep | null;
  isAdmin: boolean;
  isEntry?: boolean;
  incoming?: IncomingRef[];
  pickerDirection?: 'next' | 'previous';
  pickerIndex?: number;
  onEdit: () => void;
  onAddSub: () => void;
  onAddTransition: () => void;
  onDelete: () => void;
  onDeleteTransition: (t: Transition) => void;
  onEditGroup: (group: EditTransitionGroup) => void;
  onCoFire: (t: Transition) => void;
  onNavigate: (stepId: number) => void;
  onAddReview: (content: string) => void;
  onUpdateReview: (id: number, content: string) => void;
  onDeleteReview: (id: number) => void;
  onSetFlag: (level: StepFlagLevel | null) => void;
}

export function StepDetail({
  step,
  isAdmin,
  isEntry,
  incoming = [],
  pickerDirection,
  pickerIndex,
  onEdit,
  onAddSub,
  onAddTransition,
  onDelete,
  onDeleteTransition,
  onEditGroup,
  onCoFire,
  onNavigate,
  onAddReview,
  onUpdateReview,
  onDeleteReview,
  onSetFlag,
}: Readonly<StepDetailProps>) {
  const { modal } = AntApp.useApp();
  const [mainTab, setMainTab] = useState<string>(
    () => localStorage.getItem('stepDetail.mainTab') ?? 'details',
  );
  const [activeTab, setActiveTab] = useState<string>(
    () => localStorage.getItem('stepDetail.stepsTab') ?? 'next',
  );
  const [newReview, setNewReview] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState('');

  const handleTabChange = (key: string) => {
    setActiveTab(key);
    localStorage.setItem('stepDetail.stepsTab', key);
  };

  const handleMainTabChange = (key: string) => {
    setMainTab(key);
    localStorage.setItem('stepDetail.mainTab', key);
  };

  // Reset to Details when navigating to a different step; keep the remembered tab on first mount.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setMainTab('details');
  }, [step?.id]);

  const submitNewReview = () => {
    const text = newReview.trim();
    if (!text) return;
    onAddReview(text);
    setNewReview('');
  };

  const startEdit = (r: StepReview) => {
    setEditingId(r.id);
    setEditingText(r.content);
  };

  const submitEdit = () => {
    const text = editingText.trim();
    if (editingId == null || !text) return;
    onUpdateReview(editingId, text);
    setEditingId(null);
    setEditingText('');
  };

  // A pending keyboard branch/merge pick forces the matching tab open and highlights a row.
  const effectiveTab = pickerDirection ?? activeTab;
  // A picker also forces the Details tab so the branch/merge list is on screen.
  const effectiveMainTab = pickerDirection ? 'details' : mainTab;
  const highlightStyle = (active: boolean): React.CSSProperties =>
    active
      ? { background: 'rgba(22,119,255,0.12)', borderRadius: 6, outline: '1px solid rgba(22,119,255,0.4)' }
      : {};

  if (!step) {
    return (
      <Card>
        <Empty description="Select a step to see its details" />
      </Card>
    );
  }

  const actionItems: MenuProps['items'] = [
    { key: 'edit', icon: <EditOutlined />, label: 'Edit', onClick: onEdit },
    { key: 'sub', icon: <ApartmentOutlined />, label: 'Sub-step', onClick: onAddSub },
    { key: 'next', icon: <PlusOutlined />, label: 'Next step', onClick: onAddTransition },
    { type: 'divider' },
    {
      key: 'delete',
      icon: <DeleteOutlined />,
      label: 'Delete',
      danger: true,
      onClick: () =>
        modal.confirm({
          title: 'Delete this step?',
          content: 'Sub-steps and related transitions are removed too.',
          okText: 'Delete',
          okButtonProps: { danger: true },
          onOk: onDelete,
        }),
    },
  ];

  const currentFlag = flagMeta(step.flag);
  const flagItems: MenuProps['items'] = [
    ...STEP_FLAG_META.map((m) => ({
      key: m.level,
      label: (
        <Space size={6}>
          <span style={{ width: 8, height: 8, borderRadius: 8, background: m.color, display: 'inline-block' }} />
          {m.label}
        </Space>
      ),
      onClick: () => onSetFlag(m.level),
    })),
    { type: 'divider' as const },
    {
      key: 'clear',
      label: 'Clear Flag',
      disabled: !currentFlag,
      onClick: () => onSetFlag(null),
    },
  ];

  const nextGroups: { groupId: number | null; label?: string | null; items: { t: Transition; index: number }[] }[] = [];
  step.transitions.forEach((t, index) => {
    let group = nextGroups.find((g) => g.groupId === t.groupId);
    if (!group) {
      group = { groupId: t.groupId, label: t.label, items: [] };
      nextGroups.push(group);
    }
    group.items.push({ t, index });
  });

  const tabItems: TabsProps['items'] = [
    {
      key: 'next',
      label: (
        <Space size={4}>
          <span>Next steps</span>
          <Tag>{step.transitions.length}</Tag>
          {nextGroups.length > 1 && <Tag color="blue">decision · one</Tag>}
          {nextGroups.some((g) => g.items.length > 1) && <Tag color="green">parallel · all</Tag>}
        </Space>
      ),
      children:
        step.transitions.length === 0 ? (
          <Typography.Text type="secondary">No outgoing transitions (end of flow).</Typography.Text>
        ) : (
          <Space direction="vertical" size={10} style={{ width: '100%' }}>
            {nextGroups.map((g) => {
              const hasMeta = (g.label != null && g.label !== '') || g.items.length > 1;
              const editable = isAdmin && g.groupId != null;
              const showHeader = hasMeta || editable;
              return (
                <div key={g.groupId ?? 'none'} style={{ width: '100%' }}>
                  {showHeader && (
                    <Space size={4} style={{ marginBottom: 2, width: '100%', justifyContent: 'space-between' }}>
                      <Space size={4}>
                        {g.label ? (
                          <Tag>{g.label}</Tag>
                        ) : (
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            Always
                          </Typography.Text>
                        )}
                        {g.items.length > 1 && <Tag color="green">all</Tag>}
                      </Space>
                      {editable && (
                        <Button
                          type="text"
                          size="small"
                          icon={<EditOutlined />}
                          onClick={() =>
                            onEditGroup({
                              groupId: g.groupId as number,
                              label: g.label,
                              toStepIds: g.items.map((i) => i.t.toStepId),
                            })
                          }
                        />
                      )}
                    </Space>
                  )}
                  <Space direction="vertical" style={{ width: '100%', paddingLeft: showHeader ? 10 : 0 }}>
                    {g.items.map(({ t, index }) => (
                      <Space
                        key={t.id}
                        style={{ justifyContent: 'space-between', width: '100%', padding: '2px 6px', ...highlightStyle(pickerDirection === 'next' && pickerIndex === index) }}
                      >
                        <Space>
                          <ArrowRightOutlined />
                          <Button type="link" style={{ padding: 0 }} onClick={() => onNavigate(t.toStepId)}>
                            {t.toStepName}
                          </Button>
                          {t.coFireGroupId != null && <Tag color="volcano">co-fire</Tag>}
                        </Space>
                        {isAdmin && (
                          <Space size={0}>
                            <Button
                              type="text"
                              size="small"
                              icon={<MergeCellsOutlined />}
                              title="Co-fire with other arrivals into this target"
                              style={t.coFireGroupId != null ? { color: '#d4380d' } : undefined}
                              onClick={() => onCoFire(t)}
                            />
                            <Popconfirm title="Remove this transition?" onConfirm={() => onDeleteTransition(t)}>
                              <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                            </Popconfirm>
                          </Space>
                        )}
                      </Space>
                    ))}
                  </Space>
                </div>
              );
            })}
          </Space>
        ),
    },
    {
      key: 'previous',
      label: (
        <Space size={4}>
          <span>Previous steps</span>
          <Tag>{incoming.length}</Tag>
        </Space>
      ),
      children:
        incoming.length === 0 ? (
          <Typography.Text type="secondary">
            {isEntry ? 'Entry point — no upstream sources.' : 'No incoming transitions (currently unreachable).'}
          </Typography.Text>
        ) : (
          <Space direction="vertical" style={{ width: '100%' }}>
            {incoming.map((inc, i) => (
              <Space
                key={inc.transition.id}
                style={{ justifyContent: 'space-between', width: '100%', padding: '2px 6px', ...highlightStyle(pickerDirection === 'previous' && pickerIndex === i) }}
              >
                <Space>
                  {inc.transition.label && <Tag>{inc.transition.label}</Tag>}
                  {inc.transition.coFireGroupId != null && <Tag color="volcano">co-fire</Tag>}
                  {inc.isRollback && <Tag color="red">rollback</Tag>}
                  {inc.isSelfLoop && <Tag color="orange">self-loop</Tag>}
                  <ArrowLeftOutlined />
                  <Button type="link" style={{ padding: 0 }} onClick={() => onNavigate(inc.fromStep.id)}>
                    {inc.fromStep.name}
                  </Button>
                </Space>
              </Space>
            ))}
          </Space>
        ),
    },
  ];

  return (
    <Card
      title={
        <Space>
          <span>{step.name}</span>
          {isEntry && <Tag color="green">entry</Tag>}
          {currentFlag && (
            <Tag color={currentFlag.tagColor} icon={<FlagOutlined />}>
              {currentFlag.label}
            </Tag>
          )}
          {step.phase && <Tag color={step.phase.color ?? undefined}>{step.phase.name}</Tag>}
          {step.businessRoles.map((r) => (
            <Tag key={r.id} color={r.color ?? undefined}>
              {r.name}
            </Tag>
          ))}
        </Space>
      }
      extra={
        <Space>
          <Dropdown menu={{ items: flagItems }} trigger={['click']}>
            <Button
              size="small"
              icon={<FlagOutlined style={{ color: currentFlag?.color }} />}
              title="个人标记"
            />
          </Dropdown>
          {isAdmin && (
            <Dropdown menu={{ items: actionItems }} trigger={['click']}>
              <Button size="small" icon={<MoreOutlined />} />
            </Dropdown>
          )}
        </Space>
      }
    >
      <Tabs
        activeKey={effectiveMainTab}
        onChange={handleMainTabChange}
        items={[
          {
            key: 'details',
            label: 'Details',
            children: (
              <>
              <Descriptions column={1} size="small" styles={{ label: { width: 140 } }}>
        <Descriptions.Item label="Description">
          {step.description || <Typography.Text type="secondary">—</Typography.Text>}
        </Descriptions.Item>
        <Descriptions.Item label="Notes / cautions">
          {step.notes ? (
            <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>
              {step.notes}
            </Typography.Paragraph>
          ) : (
            <Typography.Text type="secondary">—</Typography.Text>
          )}
        </Descriptions.Item>
              </Descriptions>

              <Tabs
                style={{ marginTop: 16 }}
                activeKey={effectiveTab}
                onChange={handleTabChange}
                items={tabItems}
              />
              </>
            ),
          },
          {
            key: 'reviews',
            label: (
              <Space size={4}>
                <span>Reviews</span>
                <Tag>{step.reviews.length}</Tag>
              </Space>
            ),
            children: (
              <div>
        {isAdmin && (
          <Space.Compact style={{ width: '100%', marginTop: 8 }}>
            <Input.TextArea
              value={newReview}
              onChange={(e) => setNewReview(e.target.value)}
              placeholder="Add a review: your take, a question, an improvement idea…"
              autoSize={{ minRows: 2, maxRows: 6 }}
              maxLength={4000}
            />
            <Button type="primary" disabled={!newReview.trim()} onClick={submitNewReview}>
              Add
            </Button>
          </Space.Compact>
        )}
        {step.reviews.length === 0 ? (
          <Typography.Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
            No reviews yet.
          </Typography.Text>
        ) : (
          <List
            style={{ marginTop: 8 }}
            size="small"
            dataSource={step.reviews}
            pagination={step.reviews.length > 5 ? { pageSize: 5, size: 'small' } : false}
            renderItem={(r) =>
              editingId === r.id ? (
                <List.Item>
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Input.TextArea
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      autoSize={{ minRows: 2, maxRows: 6 }}
                      maxLength={4000}
                    />
                    <Space>
                      <Button size="small" type="primary" disabled={!editingText.trim()} onClick={submitEdit}>
                        Save
                      </Button>
                      <Button size="small" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                    </Space>
                  </Space>
                </List.Item>
              ) : (
                <List.Item
                  actions={
                    isAdmin
                      ? [
                          <Button
                            key="edit"
                            type="text"
                            size="small"
                            icon={<EditOutlined />}
                            onClick={() => startEdit(r)}
                          />,
                          <Popconfirm
                            key="delete"
                            title="Delete this review?"
                            onConfirm={() => onDeleteReview(r.id)}
                          >
                            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                          </Popconfirm>,
                        ]
                      : undefined
                  }
                >
                  <Space direction="vertical" size={2} style={{ width: '100%' }}>
                    <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>
                      {r.content}
                    </Typography.Paragraph>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {new Date(r.createdAt).toLocaleString()}
                      {r.updatedAt !== r.createdAt ? ' (edited)' : ''}
                    </Typography.Text>
                  </Space>
                </List.Item>
              )
            }
          />
        )}
              </div>
            ),
          },
        ]}
      />
    </Card>
  );
}
