import { Button, Card, Descriptions, Empty, Popconfirm, Space, Tag, Typography } from 'antd';
import {
  ApartmentOutlined,
  ArrowRightOutlined,
  DeleteOutlined,
  EditOutlined,
  FlagOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import type { Transition, WorkflowStep } from '../../api/workflow';

interface StepDetailProps {
  step: WorkflowStep | null;
  isAdmin: boolean;
  isEntry?: boolean;
  onEdit: () => void;
  onAddSub: () => void;
  onAddTransition: () => void;
  onDelete: () => void;
  onDeleteTransition: (t: Transition) => void;
  onNavigate: (stepId: number) => void;
  onSetEntry?: () => void;
}

export function StepDetail({
  step,
  isAdmin,
  isEntry,
  onEdit,
  onAddSub,
  onAddTransition,
  onDelete,
  onDeleteTransition,
  onNavigate,
  onSetEntry,
}: StepDetailProps) {
  if (!step) {
    return (
      <Card>
        <Empty description="Select a step to see its details" />
      </Card>
    );
  }

  return (
    <Card
      title={
        <Space>
          <span>{step.name}</span>
          {isEntry && <Tag color="green">entry</Tag>}
          {step.businessRole && <Tag color={step.businessRole.color ?? undefined}>{step.businessRole.name}</Tag>}
        </Space>
      }
      extra={
        isAdmin && (
          <Space>
            <Button size="small" icon={<EditOutlined />} onClick={onEdit}>
              Edit
            </Button>
            {onSetEntry && !isEntry && (
              <Button size="small" icon={<FlagOutlined />} onClick={onSetEntry}>
                Set as entry
              </Button>
            )}
            <Button size="small" icon={<ApartmentOutlined />} onClick={onAddSub}>
              Sub-step
            </Button>
            <Button size="small" icon={<PlusOutlined />} onClick={onAddTransition}>
              Next step
            </Button>
            <Popconfirm
              title="Delete this step?"
              description="Sub-steps and related transitions are removed too."
              onConfirm={onDelete}
            >
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
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

      <Typography.Title level={5} style={{ marginTop: 16 }}>
        Next steps {step.transitions.length > 1 && <Tag color="blue">branching</Tag>}
      </Typography.Title>
      {step.transitions.length === 0 ? (
        <Typography.Text type="secondary">No outgoing transitions (end of flow).</Typography.Text>
      ) : (
        <Space direction="vertical" style={{ width: '100%' }}>
          {step.transitions.map((t) => (
            <Space key={t.id} style={{ justifyContent: 'space-between', width: '100%' }}>
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
      )}
    </Card>
  );
}
