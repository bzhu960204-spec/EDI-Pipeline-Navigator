import { Form, Input, Modal, Select } from 'antd';
import { useEffect } from 'react';
import type { WorkflowStep } from '../../api/workflow';
import { flattenSteps } from './workflowUtils';

interface TransitionFormModalProps {
  open: boolean;
  fromStep: WorkflowStep | null;
  tree: WorkflowStep[];
  confirmLoading?: boolean;
  onCancel: () => void;
  onSubmit: (values: { toStepId: number; label?: string }) => void;
}

export function TransitionFormModal({
  open,
  fromStep,
  tree,
  confirmLoading,
  onCancel,
  onSubmit,
}: TransitionFormModalProps) {
  const [form] = Form.useForm<{ toStepId: number; label?: string }>();

  useEffect(() => {
    if (open) form.resetFields();
  }, [open, form]);

  const options = flattenSteps(tree)
    .filter((s) => s.id !== fromStep?.id)
    .map((s) => ({ value: s.id, label: `${'— '.repeat(s.depth)}${s.name}` }));

  return (
    <Modal
      open={open}
      title={`Add next step from "${fromStep?.name ?? ''}"`}
      okText="Add"
      confirmLoading={confirmLoading}
      onCancel={onCancel}
      onOk={() => form.submit()}
      destroyOnClose
    >
      <Form form={form} layout="vertical" onFinish={onSubmit} requiredMark={false}>
        <Form.Item
          name="toStepId"
          label="Go to step"
          rules={[{ required: true, message: 'Select a target step' }]}
        >
          <Select showSearch optionFilterProp="label" placeholder="Target step" options={options} />
        </Form.Item>
        <Form.Item name="label" label="Condition / branch label">
          <Input placeholder='e.g. "If approved" or "If rejected"' />
        </Form.Item>
      </Form>
    </Modal>
  );
}
