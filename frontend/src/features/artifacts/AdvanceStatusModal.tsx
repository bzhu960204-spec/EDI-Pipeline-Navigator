import { Form, Input, Modal, Select } from 'antd';
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAllSteps } from '../../api/workflow';
import { flattenSteps } from '../workflow/workflowUtils';

interface AdvanceStatusModalProps {
  open: boolean;
  currentStepId?: number | null;
  confirmLoading?: boolean;
  onCancel: () => void;
  onSubmit: (values: { toStepId: number; comment?: string }) => void;
}

export function AdvanceStatusModal({
  open,
  currentStepId,
  confirmLoading,
  onCancel,
  onSubmit,
}: AdvanceStatusModalProps) {
  const [form] = Form.useForm<{ toStepId: number; comment?: string }>();
  const { data: tree = [] } = useQuery({ queryKey: ['workflow', 'all-steps'], queryFn: fetchAllSteps });

  useEffect(() => {
    if (open) {
      form.setFieldsValue({ toStepId: currentStepId ?? undefined, comment: '' });
    }
  }, [open, currentStepId, form]);

  const options = flattenSteps(tree).map((s) => ({
    value: s.id,
    label: `${'— '.repeat(s.depth)}${s.name}`,
  }));

  return (
    <Modal
      open={open}
      title="Update workflow status"
      okText="Update"
      confirmLoading={confirmLoading}
      onCancel={onCancel}
      onOk={() => form.submit()}
      destroyOnClose
    >
      <Form form={form} layout="vertical" onFinish={onSubmit} requiredMark={false}>
        <Form.Item
          name="toStepId"
          label="Move to step"
          rules={[{ required: true, message: 'Select a step' }]}
        >
          <Select showSearch optionFilterProp="label" placeholder="Workflow step" options={options} />
        </Form.Item>
        <Form.Item name="comment" label="Comment">
          <Input.TextArea rows={3} placeholder="Optional note about this transition" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
