import { Form, Modal, Select, Typography } from 'antd';
import { useEffect } from 'react';
import type { Transition } from '../../api/workflow';
import type { IncomingRef } from './workflowUtils';

interface CoFireModalProps {
  open: boolean;
  /** The outgoing edge the co-fire is being authored from; its target defines the shared arrival step. */
  anchor: Transition | null;
  /** All transitions that land on the anchor's target step (candidate co-fire members). */
  incoming: IncomingRef[];
  confirmLoading?: boolean;
  onCancel: () => void;
  onSubmit: (transitionIds: number[]) => void;
}

export function CoFireModal({
  open,
  anchor,
  incoming,
  confirmLoading,
  onCancel,
  onSubmit,
}: CoFireModalProps) {
  const [form] = Form.useForm<{ transitionIds: number[] }>();

  useEffect(() => {
    if (!open || !anchor) return;
    const groupId = anchor.coFireGroupId;
    const preselected =
      groupId != null
        ? incoming.filter((inc) => inc.transition.coFireGroupId === groupId).map((inc) => inc.transition.id)
        : [anchor.id];
    form.setFieldsValue({ transitionIds: preselected });
  }, [open, anchor, incoming, form]);

  const options = incoming.map((inc) => ({
    value: inc.transition.id,
    label: inc.transition.label ? `${inc.fromStep.name} (${inc.transition.label})` : inc.fromStep.name,
  }));

  return (
    <Modal
      open={open}
      title={`Co-fire arrivals into "${anchor?.toStepName ?? ''}"`}
      okText="Save"
      confirmLoading={confirmLoading}
      onCancel={onCancel}
      onOk={() => form.submit()}
      destroyOnClose
    >
      <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
        The selected arrivals must all happen before "{anchor?.toStepName ?? ''}" starts (AND). Leave one or
        none selected to remove the co-fire requirement.
      </Typography.Paragraph>
      <Form form={form} layout="vertical" onFinish={(v) => onSubmit(v.transitionIds ?? [])} requiredMark={false}>
        <Form.Item name="transitionIds" label="Arrivals that fire together">
          <Select
            mode="multiple"
            showSearch
            optionFilterProp="label"
            placeholder="Pick two or more incoming transitions"
            options={options}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
