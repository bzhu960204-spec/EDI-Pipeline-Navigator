import { Form, Input, Modal, Select } from 'antd';
import { useEffect } from 'react';
import type { BusinessRole, WorkflowStep } from '../../api/workflow';

export interface StepFormValues {
  name: string;
  description?: string;
  notes?: string;
  businessRoleId?: number | null;
}

interface StepFormModalProps {
  open: boolean;
  title: string;
  roles: BusinessRole[];
  initial?: WorkflowStep | null;
  confirmLoading?: boolean;
  onCancel: () => void;
  onSubmit: (values: StepFormValues) => void;
}

export function StepFormModal({
  open,
  title,
  roles,
  initial,
  confirmLoading,
  onCancel,
  onSubmit,
}: StepFormModalProps) {
  const [form] = Form.useForm<StepFormValues>();

  useEffect(() => {
    if (open) {
      form.setFieldsValue({
        name: initial?.name ?? '',
        description: initial?.description ?? '',
        notes: initial?.notes ?? '',
        businessRoleId: initial?.businessRole?.id ?? null,
      });
    }
  }, [open, initial, form]);

  return (
    <Modal
      open={open}
      title={title}
      okText="Save"
      confirmLoading={confirmLoading}
      onCancel={onCancel}
      onOk={() => form.submit()}
      destroyOnClose
    >
      <Form form={form} layout="vertical" onFinish={onSubmit} requiredMark={false}>
        <Form.Item
          name="name"
          label="Step name"
          rules={[{ required: true, message: 'Name is required' }]}
        >
          <Input placeholder="e.g. Map Creation" autoFocus />
        </Form.Item>
        <Form.Item name="businessRoleId" label="Responsible role">
          <Select
            allowClear
            placeholder="Unassigned"
            options={roles.map((r) => ({ value: r.id, label: r.name }))}
          />
        </Form.Item>
        <Form.Item name="description" label="Description">
          <Input.TextArea rows={3} placeholder="What happens in this step" />
        </Form.Item>
        <Form.Item name="notes" label="Notes / cautions">
          <Input.TextArea rows={3} placeholder="Gotchas, checklist reminders, etc." />
        </Form.Item>
      </Form>
    </Modal>
  );
}
