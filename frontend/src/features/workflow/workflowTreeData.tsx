import { Space, Tooltip, Typography } from 'antd';
import type { DataNode } from 'antd/es/tree';
import { BranchesOutlined } from '@ant-design/icons';
import type { WorkflowPhase, WorkflowStep } from '../../api/workflow';

export function toTreeData(steps: WorkflowStep[]): DataNode[] {
  return steps.map((step) => {
    const hasBranch = step.transitions.length > 1;
    const hasMeta = step.businessRoles.length > 0 || hasBranch;
    return {
      key: step.id,
      title: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '2px 0' }}>
          <span style={{ wordBreak: 'break-word', lineHeight: 1.35 }}>{step.name}</span>
          {hasMeta && (
            <Space size={6} wrap>
              {step.businessRoles.map((role) => (
                <Space key={role.id} size={4} style={{ lineHeight: 1 }}>
                  <span
                    style={{
                      display: 'inline-block',
                      width: 8,
                      height: 8,
                      borderRadius: 8,
                      background: role.color ?? '#bfbfbf',
                    }}
                  />
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {role.name}
                  </Typography.Text>
                </Space>
              ))}
              {hasBranch && (
                <Tooltip title="Branches into multiple next steps">
                  <BranchesOutlined style={{ color: '#1677ff', fontSize: 12 }} />
                </Tooltip>
              )}
            </Space>
          )}
        </div>
      ),
      children: step.children?.length ? toTreeData(step.children) : undefined,
    };
  });
}

/** Groups root steps under collapsible phase headers (ordered), with an Ungrouped bucket last. */
export function toPhaseGroupedTreeData(rootSteps: WorkflowStep[], phases: WorkflowPhase[]): DataNode[] {
  const nodes: DataNode[] = [];
  [...phases]
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .forEach((phase) => {
      const members = rootSteps.filter((s) => s.phase?.id === phase.id);
      if (members.length === 0) return;
      nodes.push({
        key: `phase-${phase.id}`,
        selectable: false,
        title: (
          <Space size={6}>
            <span
              style={{
                display: 'inline-block',
                width: 9,
                height: 9,
                borderRadius: 9,
                background: phase.color ?? '#bfbfbf',
              }}
            />
            <span style={{ fontWeight: 600 }}>{phase.name}</span>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              ({members.length})
            </Typography.Text>
          </Space>
        ),
        children: toTreeData(members),
      });
    });
  const ungrouped = rootSteps.filter((s) => !s.phase);
  if (ungrouped.length > 0) {
    nodes.push({
      key: 'phase-none',
      selectable: false,
      title: (
        <Typography.Text type="secondary" style={{ fontWeight: 600 }}>
          Ungrouped ({ungrouped.length})
        </Typography.Text>
      ),
      children: toTreeData(ungrouped),
    });
  }
  return nodes;
}
