import { Alert, Form, Input, Modal, Select, Space, Spin, Steps, Tag, Tree, Typography, Upload } from 'antd';
import { InboxOutlined, FileOutlined, FolderOutlined, WarningOutlined } from '@ant-design/icons';
import type { DataNode } from 'antd/es/tree';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { analyzeImport, type ImportAnalysis, type ImportNode } from '../../api/artifacts';
import { fetchTemplate, type TemplateNode, type TemplateSummary } from '../../api/templates';
import { extractErrorMessage } from '../../api/client';

export interface CreateArtifactValues {
  name: string;
  ediRef?: string;
  templateId?: number | null;
  importToken?: string | null;
  selectedTemplatePaths?: string[];
}

interface CreateArtifactModalProps {
  open: boolean;
  templates: TemplateSummary[];
  confirmLoading?: boolean;
  onCancel: () => void;
  onSubmit: (values: CreateArtifactValues) => void;
}

/** Normalises a folder path for case-insensitive matching (mirrors the backend). */
function normalizePath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .split('/')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .join('/');
}

function collectImportFolderPaths(nodes: ImportNode[], acc: Set<string>): void {
  for (const node of nodes) {
    if (node.folder) {
      acc.add(normalizePath(node.path));
      collectImportFolderPaths(node.children, acc);
    }
  }
}

function importTreeData(nodes: ImportNode[], templatePaths: Set<string>): DataNode[] {
  return nodes.map((node) => {
    const inTemplate = !node.folder || templatePaths.has(normalizePath(node.path));
    return {
      key: `imp:${node.path}`,
      title: (
        <Space size={4}>
          {node.folder ? <FolderOutlined /> : <FileOutlined />}
          <span>{node.name}</span>
          {node.folder && templatePaths.size > 0 && !inTemplate ? (
            <Tag color="warning" style={{ marginInlineStart: 4 }}>
              not in template
            </Tag>
          ) : null}
        </Space>
      ),
      selectable: false,
      children: node.folder ? importTreeData(node.children, templatePaths) : undefined,
    } as DataNode;
  });
}

function templateTreeData(
  nodes: TemplateNode[],
  parentPath: string,
  importFolderPaths: Set<string>,
): DataNode[] {
  return nodes.map((node) => {
    const path = parentPath ? `${parentPath}/${node.name}` : node.name;
    const present = importFolderPaths.has(normalizePath(path));
    return {
      key: path,
      title: (
        <Space size={4}>
          <FolderOutlined />
          <span>{node.name}</span>
          {present ? (
            <Tag color="default" style={{ marginInlineStart: 4 }}>
              from import
            </Tag>
          ) : (
            <Tag color="processing" style={{ marginInlineStart: 4 }}>
              template extra
            </Tag>
          )}
        </Space>
      ),
      disableCheckbox: present,
      children: templateTreeData(node.children, path, importFolderPaths),
    } as DataNode;
  });
}

function collectTemplatePaths(nodes: TemplateNode[], parentPath: string, acc: string[]): void {
  for (const node of nodes) {
    const path = parentPath ? `${parentPath}/${node.name}` : node.name;
    acc.push(path);
    collectTemplatePaths(node.children, path, acc);
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
  const templateId = Form.useWatch('templateId', form);

  const [step, setStep] = useState(0);
  const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [checkedPaths, setCheckedPaths] = useState<string[]>([]);
  const [checkedTouched, setCheckedTouched] = useState(false);

  useEffect(() => {
    if (open) {
      form.setFieldsValue({ name: '', ediRef: '', templateId: defaultTemplate?.id ?? null });
      setStep(0);
      setAnalysis(null);
      setAnalyzing(false);
      setAnalyzeError(null);
      setCheckedPaths([]);
      setCheckedTouched(false);
    }
  }, [open, defaultTemplate, form]);

  const templateQuery = useQuery({
    queryKey: ['template', templateId],
    queryFn: () => fetchTemplate(templateId as number),
    enabled: open && templateId != null,
  });

  const importFolderPaths = useMemo(() => {
    const set = new Set<string>();
    if (analysis) collectImportFolderPaths(analysis.importTree, set);
    return set;
  }, [analysis]);

  const templatePaths = useMemo(() => {
    const set = new Set<string>();
    if (templateQuery.data) {
      const acc: string[] = [];
      collectTemplatePaths(templateQuery.data.nodes, '', acc);
      acc.forEach((p) => set.add(normalizePath(p)));
    }
    return set;
  }, [templateQuery.data]);

  const hasImport = analysis != null;
  const hasTemplate = templateId != null;
  const showOverlayStep = hasImport && hasTemplate;

  // Default: check every template folder (present ones are disabled but stay included).
  useEffect(() => {
    if (showOverlayStep && templateQuery.data && !checkedTouched) {
      const acc: string[] = [];
      collectTemplatePaths(templateQuery.data.nodes, '', acc);
      setCheckedPaths(acc);
    }
  }, [showOverlayStep, templateQuery.data, checkedTouched]);

  const mismatchFolders = useMemo(() => {
    if (!hasTemplate || templatePaths.size === 0) return [];
    return [...importFolderPaths].filter((p) => !templatePaths.has(p));
  }, [importFolderPaths, templatePaths, hasTemplate]);

  const handleFile = async (file: File) => {
    setAnalyzing(true);
    setAnalyzeError(null);
    setCheckedTouched(false);
    try {
      const result = await analyzeImport(file, (form.getFieldValue('templateId') as number | null) ?? null);
      setAnalysis(result);
    } catch (e) {
      setAnalyzeError(extractErrorMessage(e, 'Failed to read the archive'));
      setAnalysis(null);
    } finally {
      setAnalyzing(false);
    }
  };

  const steps = useMemo(() => {
    const list = [{ title: 'Basics' }, { title: 'Import (optional)' }];
    if (showOverlayStep) list.push({ title: 'Template folders' });
    return list;
  }, [showOverlayStep]);

  const isLastStep = step >= steps.length - 1;

  const finish = () => {
    const values = form.getFieldsValue();
    const selectedTemplatePaths = showOverlayStep
      ? checkedPaths.filter((p) => !importFolderPaths.has(normalizePath(p)))
      : undefined;
    onSubmit({
      name: values.name,
      ediRef: values.ediRef,
      templateId: values.templateId ?? null,
      importToken: analysis?.importToken ?? null,
      selectedTemplatePaths,
    });
  };

  const handleOk = async () => {
    if (step === 0) {
      try {
        await form.validateFields(['name']);
      } catch {
        return;
      }
    }
    if (isLastStep) {
      finish();
    } else {
      setStep((s) => Math.min(s + 1, steps.length - 1));
    }
  };

  const handleBack = () => setStep((s) => Math.max(s - 1, 0));

  return (
    <Modal
      open={open}
      title="New artifact"
      width={640}
      okText={isLastStep ? 'Create' : 'Next'}
      cancelText={step === 0 ? 'Cancel' : 'Back'}
      confirmLoading={confirmLoading}
      okButtonProps={{ disabled: analyzing }}
      onCancel={step === 0 ? onCancel : handleBack}
      onOk={handleOk}
      destroyOnClose
      maskClosable={false}
    >
      <Steps current={step} items={steps} size="small" style={{ marginBottom: 20 }} />

      <Form form={form} layout="vertical" requiredMark={false}>
        <div style={{ display: step === 0 ? 'block' : 'none' }}>
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
        </div>
      </Form>

      {step === 1 ? (
        <div>
          <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
            Optionally import a half-finished directory as a <b>.zip</b> archive. Empty folders are preserved.
            Everything you import is always kept; the template only adds folders it does not already contain.
          </Typography.Paragraph>
          <Upload.Dragger
            accept=".zip"
            multiple={false}
            maxCount={1}
            showUploadList={false}
            beforeUpload={(file) => {
              void handleFile(file as unknown as File);
              return false;
            }}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">Click or drag a .zip archive here</p>
            <p className="ant-upload-hint">Skip this step to start from an empty or template-only structure.</p>
          </Upload.Dragger>

          {analyzing ? (
            <div style={{ textAlign: 'center', padding: 16 }}>
              <Spin /> <Typography.Text type="secondary">Reading archive…</Typography.Text>
            </div>
          ) : null}
          {analyzeError ? (
            <Alert type="error" showIcon style={{ marginTop: 12 }} message={analyzeError} />
          ) : null}
          {analysis ? (
            <div style={{ marginTop: 12 }}>
              <Space style={{ marginBottom: 8 }}>
                <Tag color="blue">{analysis.folderCount} folders</Tag>
                <Tag color="green">{analysis.fileCount} files</Tag>
                <Tag>{formatBytes(analysis.totalBytes)}</Tag>
              </Space>
              <Tree
                treeData={importTreeData(analysis.importTree, templatePaths)}
                selectable={false}
                height={220}
                defaultExpandAll
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {step === 2 && showOverlayStep ? (
        <div>
          <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
            Choose which template folders to add on top of your import. Folders already present in the import are
            locked and always kept.
          </Typography.Paragraph>
          {mismatchFolders.length > 0 ? (
            <Alert
              type="warning"
              showIcon
              icon={<WarningOutlined />}
              style={{ marginBottom: 12 }}
              message="Some imported folders are not part of the template"
              description={
                <span>
                  These may be intentional or a naming mismatch: <b>{mismatchFolders.join(', ')}</b>
                </span>
              }
            />
          ) : null}
          {templateQuery.isLoading ? (
            <Spin />
          ) : (
            <Tree
              checkable
              selectable={false}
              height={260}
              defaultExpandAll
              checkedKeys={checkedPaths}
              onCheck={(checked) => {
                setCheckedTouched(true);
                setCheckedPaths(checked as string[]);
              }}
              treeData={templateTreeData(templateQuery.data?.nodes ?? [], '', importFolderPaths)}
            />
          )}
        </div>
      ) : null}
    </Modal>
  );
}
