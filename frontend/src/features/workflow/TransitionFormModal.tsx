import { Form, Input, Modal, Select } from 'antd';
import { useEffect } from 'react';
import type { WorkflowStep } from '../../api/workflow';
import { flattenSteps } from './workflowUtils';

export interface EditTransitionGroup {
  groupId: number;
  label?: string | null;
  toStepIds: number[];
}

interface TransitionFormModalProps {
  open: boolean;
  fromStep: WorkflowStep | null;
  tree: WorkflowStep[];
  /** When set, the modal edits an existing condition group instead of adding a new one. */
  editGroup?: EditTransitionGroup | null;
  confirmLoading?: boolean;
  onCancel: () => void;
  onSubmit: (values: { toStepIds: number[]; label?: string }) => void;
  onSubmitGroup?: (values: { toStepIds: number[]; label?: string }) => void;
}

export function TransitionFormModal({
  open,
  fromStep,
  tree,
  editGroup,
  confirmLoading,
  onCancel,
  onSubmit,
  onSubmitGroup,
}: TransitionFormModalProps) {
  const isEdit = editGroup != null;
  const [form] = Form.useForm<{ toStepIds: number[]; label?: string }>();

  useEffect(() => {
    if (!open) return;
    if (editGroup) {
      form.setFieldsValue({ toStepIds: editGroup.toStepIds, label: editGroup.label ?? undefined });
    } else {
      form.resetFields();
    }
  }, [open, editGroup, form]);

  const options = flattenSteps(tree)
    .filter((s) => s.id !== fromStep?.id)
    .map((s) => ({ value: s.id, label: `${'— '.repeat(s.depth)}${s.name}` }));

  const handleFinish = (values: { toStepIds: number[]; label?: string }) => {
    if (isEdit) {
      onSubmitGroup?.({ toStepIds: values.toStepIds, label: values.label });
    } else {
      onSubmit({ toStepIds: values.toStepIds, label: values.label });
    }
  };

  return (
    <Modal
      open={open}
      title={isEdit ? 'Edit condition' : `Add next step from "${fromStep?.name ?? ''}"`}
      okText={isEdit ? 'Save' : 'Add'}
      confirmLoading={confirmLoading}
      onCancel={onCancel}
      onOk={() => form.submit()}
      destroyOnClose
    >
      <Form form={form} layout="vertical" onFinish={handleFinish} requiredMark={false}>
        <Form.Item
          name="toStepIds"
          label="Target steps"
          tooltip="Steps selected here form one condition and all start together (parallel). To create an either/or branch instead, add them as separate conditions."
          rules={[{ required: true, message: 'Select at least one target step' }]}
        >
          <Select
            mode="multiple"
            showSearch
            optionFilterProp="label"
            placeholder="Target steps (all start together)"
            options={options}
          />
        </Form.Item>
        <Form.Item name="label" label="Condition / branch label">
          <Input placeholder='e.g. "If approved" or "If rejected"' />
        </Form.Item>
      </Form>
    </Modal>
  );
}
