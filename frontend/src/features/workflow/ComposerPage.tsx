import { useMemo, useState } from 'react';
import {
  App as AntApp,
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
  Segmented,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd';
import { ArrowLeftOutlined, ArrowRightOutlined, DeleteOutlined, LinkOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import {
  addMember,
  createLink,
  deleteLink,
  fetchComposite,
  fetchWorkflows,
  removeMember,
  type CompositeMember,
  type WorkflowLinkPayload,
} from '../../api/workflow';
import { extractErrorMessage } from '../../api/client';
import { isAdmin, useAuthStore } from '../auth/authStore';
import { flattenSteps } from './workflowUtils';
import { ComposerCanvas } from './ComposerCanvas';

interface LinkFormValues {
  fromWorkflowId: number;
  fromExitStepId?: number;
  toWorkflowId: number;
  toEntryStepId?: number;
  label?: string;
}

export function ComposerPage() {
  const { message } = AntApp.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id } = useParams();
  const masterId = Number(id);
  const admin = isAdmin(useAuthStore((s) => s.user));
  const [form] = Form.useForm<LinkFormValues>();

  const [addSubId, setAddSubId] = useState<number | undefined>(undefined);
  const [linkOpen, setLinkOpen] = useState(false);
  const [view, setView] = useState<'list' | 'canvas'>('list');

  const compositeKey = ['composite', masterId];
  const { data: composite, isLoading } = useQuery({
    queryKey: compositeKey,
    queryFn: () => fetchComposite(masterId),
    enabled: Number.isFinite(masterId),
  });
  const { data: publishedSubs = [] } = useQuery({
    queryKey: ['workflows', { type: 'SUB', status: 'PUBLISHED' }],
    queryFn: () => fetchWorkflows({ type: 'SUB', status: 'PUBLISHED' }),
  });

  const members = composite?.members ?? [];
  const links = composite?.links ?? [];

  const memberById = useMemo(() => {
    const map = new Map<number, CompositeMember>();
    members.forEach((m) => map.set(m.workflow.id, m));
    return map;
  }, [members]);

  const availableSubs = useMemo(
    () => publishedSubs.filter((s) => !memberById.has(s.id) && s.id !== masterId),
    [publishedSubs, memberById, masterId],
  );

  const setComposite = (data: typeof composite) => queryClient.setQueryData(compositeKey, data);

  const addMemberMut = useMutation({
    mutationFn: (subId: number) => addMember(masterId, subId),
    onSuccess: (data) => {
      message.success('Sub-workflow added');
      setAddSubId(undefined);
      setComposite(data);
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to add sub-workflow')),
  });

  const removeMemberMut = useMutation({
    mutationFn: (subId: number) => removeMember(masterId, subId),
    onSuccess: (data) => {
      message.success('Sub-workflow removed');
      setComposite(data);
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to remove sub-workflow')),
  });

  const addLinkMut = useMutation({
    mutationFn: (values: LinkFormValues) => {
      const payload: WorkflowLinkPayload = { masterWorkflowId: masterId, ...values };
      return createLink(payload);
    },
    onSuccess: () => {
      message.success('Connection added');
      setLinkOpen(false);
      form.resetFields();
      queryClient.invalidateQueries({ queryKey: compositeKey });
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to add connection')),
  });

  const removeLinkMut = useMutation({
    mutationFn: (linkId: number) => deleteLink(linkId),
    onSuccess: () => {
      message.success('Connection removed');
      queryClient.invalidateQueries({ queryKey: compositeKey });
    },
    onError: (e) => message.error(extractErrorMessage(e, 'Failed to remove connection')),
  });

  const memberOptions = members.map((m) => ({ value: m.workflow.id, label: m.workflow.name }));

  const stepOptions = (workflowId?: number) => {
    const member = workflowId != null ? memberById.get(workflowId) : undefined;
    if (!member) return [];
    return flattenSteps(member.tree).map((s) => ({
      value: s.id,
      label: `${'— '.repeat(s.depth)}${s.name}`,
    }));
  };

  const watchFrom = Form.useWatch('fromWorkflowId', form);
  const watchTo = Form.useWatch('toWorkflowId', form);

  const nameOf = (workflowId: number) => memberById.get(workflowId)?.workflow.name ?? `#${workflowId}`;

  const quickLink = (fromWorkflowId: number, toWorkflowId: number) =>
    addLinkMut.mutate({ fromWorkflowId, toWorkflowId });

  const addPieceControl = admin && (
    <Space>
      <Select
        style={{ width: 220 }}
        placeholder="Add a published sub-workflow"
        value={addSubId}
        onChange={setAddSubId}
        options={availableSubs.map((s) => ({ value: s.id, label: s.name }))}
        notFoundContent="No published sub-workflows"
      />
      <Button
        icon={<PlusOutlined />}
        disabled={addSubId == null}
        loading={addMemberMut.isPending}
        onClick={() => addSubId != null && addMemberMut.mutate(addSubId)}
      >
        Add
      </Button>
    </Space>
  );

  if (isLoading) {
    return <Spin />;
  }

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/workflow')}>
            Sub-Workflows
          </Button>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {composite?.master.name ?? 'Composer'}
          </Typography.Title>
          <Tag color="purple">MASTER</Tag>
        </Space>
        <Space>
          <Segmented
            value={view}
            onChange={(v) => setView(v as 'list' | 'canvas')}
            options={[
              { label: 'List', value: 'list' },
              { label: 'Canvas', value: 'canvas' },
            ]}
          />
          {admin && view === 'list' && (
            <Button
              type="primary"
              icon={<LinkOutlined />}
              disabled={members.length < 1}
              onClick={() => {
                form.resetFields();
                setLinkOpen(true);
              }}
            >
              Add connection
            </Button>
          )}
        </Space>
      </Row>

      {view === 'canvas' ? (
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          {addPieceControl}
          {members.length === 0 ? (
            <Empty description="No pieces yet. Add a published sub-workflow to start composing." />
          ) : (
            <>
              <ComposerCanvas
                members={members}
                links={links}
                editable={admin}
                onCreateLink={quickLink}
                onDeleteLink={(linkId) => removeLinkMut.mutate(linkId)}
              />
              {admin && (
                <Typography.Text type="secondary">
                  Drag from one piece to another to connect them. Select an edge and press Delete to remove it.
                  Use List view to attach specific entry/exit steps.
                </Typography.Text>
              )}
            </>
          )}
        </Space>
      ) : (
        <Row gutter={16}>
          <Col xs={24} lg={13}>
            <Card
              title="Pieces (placed sub-workflows)"
              size="small"
              extra={addPieceControl}
            >
            {members.length === 0 ? (
              <Empty description="No pieces yet. Add a published sub-workflow to start composing." />
            ) : (
              <List
                dataSource={members}
                rowKey={(m) => m.workflow.id}
                renderItem={(m) => (
                  <List.Item
                    actions={
                      admin
                        ? [
                            <Popconfirm
                              key="remove"
                              title="Remove this piece?"
                              description="Connections touching it will also be removed."
                              onConfirm={() => removeMemberMut.mutate(m.workflow.id)}
                            >
                              <Button size="small" danger icon={<DeleteOutlined />} />
                            </Popconfirm>,
                          ]
                        : undefined
                    }
                  >
                    <List.Item.Meta
                      title={m.workflow.name}
                      description={
                        <Space size={4}>
                          <Tag>{flattenSteps(m.tree).length} steps</Tag>
                          {!!m.workflow.entryStepId && <Tag color="blue">has entry</Tag>}
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>

        <Col xs={24} lg={11}>
          <Card title="Connections" size="small">
            {links.length === 0 ? (
              <Empty description="No connections yet." />
            ) : (
              <List
                dataSource={links}
                rowKey={(l) => l.id}
                renderItem={(l) => (
                  <List.Item
                    actions={
                      admin
                        ? [
                            <Button
                              key="del"
                              size="small"
                              danger
                              icon={<DeleteOutlined />}
                              onClick={() => removeLinkMut.mutate(l.id)}
                            />,
                          ]
                        : undefined
                    }
                  >
                    <Space direction="vertical" size={0}>
                      <Space size={6}>
                        <Tag color="geekblue">
                          {nameOf(l.fromWorkflowId)}
                          {l.fromExitStepName ? ` · ${l.fromExitStepName}` : ''}
                        </Tag>
                        <ArrowRightOutlined />
                        <Tag color="green">
                          {nameOf(l.toWorkflowId)}
                          {l.toEntryStepName ? ` · ${l.toEntryStepName}` : ''}
                        </Tag>
                      </Space>
                      {l.label && <Typography.Text type="secondary">{l.label}</Typography.Text>}
                    </Space>
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>
      </Row>
      )}

      <Modal
        open={linkOpen}
        title="Add connection"
        okText="Connect"
        confirmLoading={addLinkMut.isPending}
        onCancel={() => setLinkOpen(false)}
        onOk={() => form.submit()}
      >
        <Form form={form} layout="vertical" onFinish={(values) => addLinkMut.mutate(values)}>
          <Form.Item name="fromWorkflowId" label="From piece" rules={[{ required: true }]}>
            <Select
              options={memberOptions}
              onChange={() => form.setFieldValue('fromExitStepId', undefined)}
            />
          </Form.Item>
          <Form.Item name="fromExitStepId" label="Exit step (optional)">
            <Select allowClear placeholder="End of sub-workflow" options={stepOptions(watchFrom)} />
          </Form.Item>
          <Form.Item name="toWorkflowId" label="To piece" rules={[{ required: true }]}>
            <Select
              options={memberOptions}
              onChange={() => form.setFieldValue('toEntryStepId', undefined)}
            />
          </Form.Item>
          <Form.Item name="toEntryStepId" label="Entry step (optional)">
            <Select allowClear placeholder="Entry of sub-workflow" options={stepOptions(watchTo)} />
          </Form.Item>
          <Form.Item name="label" label="Label (optional)">
            <Input placeholder='e.g. "If approved"' maxLength={200} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
