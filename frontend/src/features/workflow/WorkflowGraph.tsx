import { useEffect, useMemo, useState } from 'react';
import { Space, Switch, Tag, Typography } from 'antd';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from '@dagrejs/dagre';
import type { WorkflowPhase, WorkflowStep } from '../../api/workflow';

interface WorkflowGraphProps {
  tree: WorkflowStep[];
  phases: WorkflowPhase[];
  entryStepId?: number | null;
  selectedId: number | null;
  onSelect: (stepId: number) => void;
}

const NODE_W = 190;
const NODE_H = 58;
const BAND_PAD = 12;
const BAND_LABEL_H = 18;

function tint(color: string | null | undefined, alpha: number): string {
  if (!color || !/^#[0-9a-fA-F]{6}$/.test(color)) return `rgba(140,140,140,${alpha})`;
  const r = Number.parseInt(color.slice(1, 3), 16);
  const g = Number.parseInt(color.slice(3, 5), 16);
  const b = Number.parseInt(color.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

interface BandNodeData extends Record<string, unknown> {
  name: string;
  color?: string | null;
}

function PhaseBandNode({ data }: NodeProps) {
  const d = data as BandNodeData;
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        background: tint(d.color, 0.07),
        border: `1px dashed ${d.color ?? '#bfbfbf'}`,
        borderRadius: 10,
        position: 'relative',
      }}
    >
      <span style={{ position: 'absolute', top: 3, left: 10, fontSize: 11, fontWeight: 600, color: d.color ?? '#8c8c8c' }}>
        {d.name}
      </span>
    </div>
  );
}

interface StepNodeData extends Record<string, unknown> {
  name: string;
  roleName?: string;
  roleColor?: string;
  isEntry: boolean;
  isTerminal: boolean;
  isDecision: boolean;
  dimmed: boolean;
}

function StepNode({ data, selected }: NodeProps) {
  const d = data as StepNodeData;
  let borderColor = '#d9d9d9';
  if (selected) borderColor = '#1677ff';
  else if (d.isEntry) borderColor = '#52c41a';
  else if (d.isTerminal) borderColor = '#8c8c8c';
  else if (d.isDecision) borderColor = '#faad14';

  return (
    <div
      style={{
        width: NODE_W,
        minHeight: NODE_H,
        boxSizing: 'border-box',
        border: `${selected ? 2 : 1}px solid ${borderColor}`,
        borderLeft: `4px solid ${d.roleColor ?? borderColor}`,
        borderRadius: 8,
        padding: '6px 10px',
        fontSize: 12,
        background: 'var(--ant-color-bg-container, #fff)',
        boxShadow: selected ? '0 0 0 3px rgba(22,119,255,0.15)' : undefined,
        opacity: d.dimmed ? 0.25 : 1,
        transition: 'opacity 0.15s',
      }}
    >
      <Handle type="target" position={Position.Top} id="t" style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} id="b" style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Right} id="rt" style={{ top: '35%', opacity: 0 }} />
      <Handle type="source" position={Position.Right} id="r" style={{ top: '65%', opacity: 0 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {d.isEntry && (
          <span title="Entry" style={{ color: '#52c41a' }}>
            ▶
          </span>
        )}
        {d.isDecision && !d.isEntry && (
          <span title="Decision" style={{ color: '#faad14' }}>
            ◆
          </span>
        )}
        <span style={{ fontWeight: 500, lineHeight: 1.2 }}>{d.name}</span>
      </div>
      {d.roleName && <div style={{ fontSize: 10, opacity: 0.65, marginTop: 2 }}>{d.roleName}</div>}
    </div>
  );
}

const nodeTypes = { step: StepNode, band: PhaseBandNode };

function flatten(steps: WorkflowStep[]): WorkflowStep[] {
  const out: WorkflowStep[] = [];
  const walk = (list: WorkflowStep[]) => {
    for (const s of list) {
      out.push(s);
      if (s.children?.length) walk(s.children);
    }
  };
  walk(steps);
  return out;
}

interface RawEdge {
  transitionId: number;
  from: number;
  to: number;
  label?: string | null;
  isBack: boolean;
}

interface Band {
  id: number;
  name: string;
  color?: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface GraphModel {
  positions: Map<number, { x: number; y: number }>;
  edges: RawEdge[];
  neighbors: Map<number, Set<number>>;
  incident: Map<number, Set<number>>;
  bands: Band[];
}

// Detect rollback (back) edges via DFS, then lay out only forward edges with dagre (TB,
// crossing-minimized). Back edges are drawn separately and don't influence ranking.
// When usePhases is on, steps are grouped into dagre clusters so each phase forms a band.
function buildModel(steps: WorkflowStep[], entryStepId: number | null | undefined,
                    phases: WorkflowPhase[], usePhases: boolean): GraphModel {
  const ids = steps.map((s) => s.id);
  const idSet = new Set(ids);
  const adj = new Map<number, number[]>();
  ids.forEach((id) => adj.set(id, []));
  const rawEdges: RawEdge[] = [];
  for (const s of steps) {
    for (const t of s.transitions) {
      if (idSet.has(t.toStepId)) {
        adj.get(s.id)!.push(t.toStepId);
        rawEdges.push({ transitionId: t.id, from: s.id, to: t.toStepId, label: t.label, isBack: false });
      }
    }
  }

  const back = new Set<string>();
  const state = new Map<number, 0 | 1 | 2>();
  ids.forEach((id) => state.set(id, 0));
  const dfs = (u: number) => {
    state.set(u, 1);
    for (const v of adj.get(u)!) {
      const st = state.get(v);
      if (st === 1) back.add(`${u}->${v}`);
      else if (st === 0) dfs(v);
    }
    state.set(u, 2);
  };
  if (entryStepId != null && idSet.has(entryStepId)) dfs(entryStepId);
  ids.forEach((id) => {
    if (state.get(id) === 0) dfs(id);
  });

  const g = new dagre.graphlib.Graph({ compound: true });
  g.setGraph({ rankdir: 'TB', ranksep: 64, nodesep: 34, edgesep: 12, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));
  ids.forEach((id) => g.setNode(String(id), { width: NODE_W, height: NODE_H }));

  const usedPhaseIds = new Set<number>();
  if (usePhases) {
    for (const p of phases) {
      const members = steps.filter((s) => s.phase?.id === p.id);
      if (members.length === 0) continue;
      usedPhaseIds.add(p.id);
      g.setNode(`phase-${p.id}`, {});
      members.forEach((s) => g.setParent(String(s.id), `phase-${p.id}`));
    }
  }

  const neighbors = new Map<number, Set<number>>();
  const incident = new Map<number, Set<number>>();
  ids.forEach((id) => {
    neighbors.set(id, new Set());
    incident.set(id, new Set());
  });

  for (const e of rawEdges) {
    e.isBack = back.has(`${e.from}->${e.to}`);
    if (!e.isBack) g.setEdge(String(e.from), String(e.to));
    neighbors.get(e.from)!.add(e.to);
    neighbors.get(e.to)!.add(e.from);
    incident.get(e.from)!.add(e.transitionId);
    incident.get(e.to)!.add(e.transitionId);
  }

  dagre.layout(g);

  const positions = new Map<number, { x: number; y: number }>();
  ids.forEach((id) => {
    const n = g.node(String(id));
    if (n) positions.set(id, { x: n.x - NODE_W / 2, y: n.y - NODE_H / 2 });
  });

  const bands: Band[] = [];
  phases
    .filter((p) => usedPhaseIds.has(p.id))
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .forEach((p) => {
      const c = g.node(`phase-${p.id}`);
      if (!c?.width) return;
      bands.push({
        id: p.id,
        name: p.name,
        color: p.color,
        x: c.x - c.width / 2 - BAND_PAD,
        y: c.y - c.height / 2 - BAND_PAD - BAND_LABEL_H,
        w: c.width + BAND_PAD * 2,
        h: c.height + BAND_PAD * 2 + BAND_LABEL_H,
      });
    });

  return { positions, edges: rawEdges, neighbors, incident, bands };
}

function buildBandNodes(model: GraphModel): Node[] {
  return model.bands.map((b) => ({
    id: `band-${b.id}`,
    type: 'band',
    position: { x: b.x, y: b.y },
    data: { name: b.name, color: b.color } satisfies BandNodeData,
    draggable: false,
    selectable: false,
    focusable: false,
    deletable: false,
    connectable: false,
    zIndex: 0,
    style: { width: b.w, height: b.h, pointerEvents: 'none' as const },
  }));
}

function buildNodes(steps: WorkflowStep[], model: GraphModel, entryStepId?: number | null): Node[] {
  const backIds = new Set(model.edges.filter((e) => e.isBack).map((e) => e.transitionId));
  return steps.map((s) => {
    const forwardOut = s.transitions.filter((t) => !backIds.has(t.id));
    return {
      id: String(s.id),
      type: 'step',
      position: model.positions.get(s.id) ?? { x: 0, y: 0 },
      zIndex: 1,
      data: {
        name: s.name,
        roleName: s.businessRoles.map((r) => r.name).join(', ') || undefined,
        roleColor: s.businessRoles[0]?.color ?? undefined,
        isEntry: entryStepId != null && entryStepId === s.id,
        isTerminal: s.transitions.length === 0,
        isDecision: forwardOut.length > 1,
        dimmed: false,
      } satisfies StepNodeData,
      deletable: false,
      connectable: false,
    };
  });
}

function buildEdges(model: GraphModel): Edge[] {
  return model.edges.map((e) => ({
    id: `t${e.transitionId}`,
    source: String(e.from),
    target: String(e.to),
    sourceHandle: e.isBack ? 'r' : 'b',
    targetHandle: e.isBack ? 'rt' : 't',
    type: e.isBack ? 'default' : 'smoothstep',
    hidden: false,
  }));
}

export function WorkflowGraph({ tree, phases, entryStepId, selectedId, onSelect }: Readonly<WorkflowGraphProps>) {
  const steps = useMemo(() => flatten(tree), [tree]);
  const hasPhases = phases.length > 0;
  const [showRollback, setShowRollback] = useState(true);
  const [showPhases, setShowPhases] = useState(true);
  const usePhases = hasPhases && showPhases;

  const model = useMemo(
    () => buildModel(steps, entryStepId, phases, usePhases),
    [steps, entryStepId, phases, usePhases],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([
    ...buildBandNodes(model),
    ...buildNodes(steps, model, entryStepId),
  ]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(buildEdges(model));

  const [hoveredId, setHoveredId] = useState<number | null>(null);

  useEffect(() => {
    setNodes([...buildBandNodes(model), ...buildNodes(steps, model, entryStepId)]);
    setEdges(buildEdges(model));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  const activeId = hoveredId ?? selectedId;

  const displayNodes = useMemo(() => {
    return nodes.map((n) => {
      if (n.type !== 'step') return n;
      const id = Number(n.id);
      const near = activeId != null ? (model.neighbors.get(activeId) ?? new Set<number>()) : null;
      const dimmed = activeId != null && id !== activeId && !near!.has(id);
      return { ...n, data: { ...n.data, dimmed } };
    });
  }, [nodes, activeId, model]);

  const displayEdges = useMemo(() => {
    const incidentToActive = activeId != null ? (model.incident.get(activeId) ?? new Set<number>()) : null;
    const byId = new Map(model.edges.map((m) => [`t${m.transitionId}`, m]));
    return edges.map((e) => {
      const raw = byId.get(e.id)!;
      if (raw.isBack && !showRollback) return { ...e, hidden: true };
      const focused = incidentToActive?.has(raw.transitionId) ?? false;
      const dim = activeId != null && !focused;
      const color = raw.isBack ? '#ff4d4f' : '#8c8c8c';
      return {
        ...e,
        hidden: false,
        animated: raw.isBack && focused,
        label: focused ? (raw.label ?? undefined) : undefined,
        labelStyle: { fontSize: 11, fill: raw.isBack ? '#ff4d4f' : '#595959' },
        labelBgStyle: { fill: 'var(--ant-color-bg-container, #fff)', fillOpacity: 0.9 },
        labelBgPadding: [4, 2] as [number, number],
        labelBgBorderRadius: 4,
        style: {
          stroke: color,
          strokeWidth: focused ? 2 : 1,
          strokeDasharray: raw.isBack ? '5 4' : undefined,
          opacity: dim ? 0.12 : 1,
        },
        markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
      };
    });
  }, [edges, activeId, showRollback, model]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Space size={16} wrap style={{ paddingInline: 4 }}>
        <Space size={4}>
          <Switch size="small" checked={showRollback} onChange={setShowRollback} />
          <Typography.Text style={{ fontSize: 12 }}>Show rollbacks</Typography.Text>
        </Space>
        {hasPhases && (
          <Space size={4}>
            <Switch size="small" checked={showPhases} onChange={setShowPhases} />
            <Typography.Text style={{ fontSize: 12 }}>Show phases</Typography.Text>
          </Space>
        )}
        <Space size={12} style={{ fontSize: 11 }}>
          <span style={{ color: '#52c41a' }}>▶ Entry</span>
          <span style={{ color: '#faad14' }}>◆ Decision</span>
          <Tag color="red" style={{ margin: 0 }}>
            rollback
          </Tag>
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
            hover a step to focus
          </Typography.Text>
        </Space>
      </Space>
      <div style={{ height: 620, border: '1px solid rgba(5,5,5,0.06)', borderRadius: 8 }}>
        <ReactFlow
          nodes={displayNodes}
          edges={displayEdges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={(_, node) => {
            if (node.type === 'step') onSelect(Number(node.id));
          }}
          onNodeMouseEnter={(_, node) => {
            if (node.type === 'step') setHoveredId(Number(node.id));
          }}
          onNodeMouseLeave={() => setHoveredId(null)}
          nodesConnectable={false}
          elementsSelectable
          fitView
          minZoom={0.1}
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );
}
