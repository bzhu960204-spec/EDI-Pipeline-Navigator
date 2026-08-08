import { Form, Input, Modal, Select } from 'antd';
import { useEffect } from 'react';
import type { TemplateSummary } from '../../api/templates';

export interface CreateArtifactValues {
  name: string;
  ediRef?: string;
  templateId?: number | null;
}

interface CreateArtifactModalProps {
  open: boolean;
  templates: TemplateSummary[];
  confirmLoading?: boolean;
  onCancel: () => void;
  onSubmit: (values: CreateArtifactValues) => void;
}

export function CreateArtifactModal({
  open,
  templates,
  confirmLoading,
  onCancel,
  onSubmit,
}: CreateArtifactModalProps) {
  const [form] = Form.useForm<CreateArtifactValues>();
  const defaultTemplate = templates.find((t) => t.isDefault) ?? templates[0];

  useEffect(() => {
    if (open) {
      form.setFieldsValue({ name: '', ediRef: '', templateId: defaultTemplate?.id ?? null });
    }
  }, [open, defaultTemplate, form]);

  return (
    <Modal
      open={open}
      title="New artifact"
      okText="Create"
      confirmLoading={confirmLoading}
      onCancel={onCancel}
      onOk={() => form.submit()}
      destroyOnClose
    >
      <Form form={form} layout="vertical" onFinish={onSubmit} requiredMark={false}>
        <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Name is required' }]}>
          <Input placeholder="e.g. Schenker Migration - JP-MBL" autoFocus />
        </Form.Item>
        <Form.Item name="ediRef" label="EDI request reference">
          <Input placeholder="e.g. EDIT0019557" />
        </Form.Item>
        <Form.Item
          name="templateId"
          label="Directory template"
          extra="Folders from the template are created automatically."
        >
          <Select
            allowClear
            placeholder="No template (empty)"
            options={templates.map((t) => ({
              value: t.id,
              label: t.isDefault ? `${t.name} (default)` : t.name,
            }))}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
