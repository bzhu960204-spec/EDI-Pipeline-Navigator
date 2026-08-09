import { App as AntApp, Button, Card, Descriptions, Dropdown, Empty, Popconfirm, Space, Tabs, Tag, Typography } from 'antd';
import type { MenuProps, TabsProps } from 'antd';
import { useState } from 'react';
import {
  ApartmentOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined,
  DeleteOutlined,
  EditOutlined,
  MoreOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import type { Transition, WorkflowStep } from '../../api/workflow';
import type { IncomingRef } from './workflowUtils';

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
  onNavigate: (stepId: number) => void;
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
  onNavigate,
}: Readonly<StepDetailProps>) {
  const { modal } = AntApp.useApp();
  const [activeTab, setActiveTab] = useState<string>(
    () => localStorage.getItem('stepDetail.stepsTab') ?? 'next',
  );

  const handleTabChange = (key: string) => {
    setActiveTab(key);
    localStorage.setItem('stepDetail.stepsTab', key);
  };

  // A pending keyboard branch/merge pick forces the matching tab open and highlights a row.
  const effectiveTab = pickerDirection ?? activeTab;
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

  const tabItems: TabsProps['items'] = [
    {
      key: 'next',
      label: (
        <Space size={4}>
          <span>Next steps</span>
          <Tag>{step.transitions.length}</Tag>
          {step.transitions.length > 1 && <Tag color="blue">branching</Tag>}
        </Space>
      ),
      children:
        step.transitions.length === 0 ? (
          <Typography.Text type="secondary">No outgoing transitions (end of flow).</Typography.Text>
        ) : (
          <Space direction="vertical" style={{ width: '100%' }}>
            {step.transitions.map((t, i) => (
              <Space
                key={t.id}
                style={{ justifyContent: 'space-between', width: '100%', padding: '2px 6px', ...highlightStyle(pickerDirection === 'next' && pickerIndex === i) }}
              >
                <Space>
                  {t.label && <Tag>{t.label}</Tag>}
                  <ArrowRightOutlined />
                  <Button type="link" style={{ padding: 0 }} onClick={() => onNavigate(t.toStepId)}>
                    {t.toStepName}
                  </Button>
                </Space>
                {isAdmin && (
                  <Popconfirm title="Remove this transition?" onConfirm={() => onDeleteTransition(t)}>
                    <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                )}
              </Space>
            ))}
          </Space>
        ),
    },
    {
      key: 'previous',
      label: (
        <Space size={4}>
          <span>Previous steps</span>
          <Tag>{incoming.length}</Tag>
          {incoming.length > 1 && <Tag color="purple">merge</Tag>}
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
          {step.phase && <Tag color={step.phase.color ?? undefined}>{step.phase.name}</Tag>}
          {step.businessRoles.map((r) => (
            <Tag key={r.id} color={r.color ?? undefined}>
              {r.name}
            </Tag>
          ))}
        </Space>
      }
      extra={
        isAdmin && (
          <Dropdown menu={{ items: actionItems }} trigger={['click']}>
            <Button size="small" icon={<MoreOutlined />} />
          </Dropdown>
        )
      }
    >
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
    </Card>
  );
}
