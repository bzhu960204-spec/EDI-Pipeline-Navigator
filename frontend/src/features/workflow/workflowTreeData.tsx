import { Space, Tooltip, Typography } from 'antd';
import type { DataNode } from 'antd/es/tree';
import { BranchesOutlined, ForkOutlined, MergeCellsOutlined } from '@ant-design/icons';
import type { WorkflowPhase, WorkflowStep } from '../../api/workflow';
import { flagMeta } from './stepFlag';

export function toTreeData(steps: WorkflowStep[]): DataNode[] {
  return steps.map((step) => {
    const groupSizes = new Map<number | null, number>();
    step.transitions.forEach((t) => groupSizes.set(t.groupId, (groupSizes.get(t.groupId) ?? 0) + 1));
    const isDecision = groupSizes.size > 1;
    const isParallel = [...groupSizes.values()].some((n) => n > 1);
    const hasCoFire = step.transitions.some((t) => t.coFireGroupId != null);
    const flag = flagMeta(step.flag);
    const hasMeta = step.businessRoles.length > 0 || isParallel || isDecision || hasCoFire;
    return {
      key: step.id,
      title: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '2px 0' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, wordBreak: 'break-word', lineHeight: 1.35 }}>
            {flag && (
              <Tooltip title={`标记：${flag.label}`}>
                <span
                  aria-label={`flag-${flag.level}`}
                  style={{
                    flex: '0 0 auto',
                    width: 8,
                    height: 8,
                    borderRadius: 8,
                    background: flag.color,
                  }}
                />
              </Tooltip>
            )}
            <span>{step.name}</span>
          </span>
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
              {isParallel && (
                <Tooltip title="Parallel — a condition starts several next steps together">
                  <ForkOutlined style={{ color: '#52c41a', fontSize: 12 }} />
                </Tooltip>
              )}
              {isDecision && (
                <Tooltip title="Decision — multiple conditions branch out">
                  <BranchesOutlined style={{ color: '#1677ff', fontSize: 12 }} />
                </Tooltip>
              )}
              {hasCoFire && (
                <Tooltip title="Co-fire — this exit must arrive together with others before its target starts">
                  <MergeCellsOutlined style={{ color: '#d4380d', fontSize: 12 }} />
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
