import { useCallback, useEffect } from 'react';
import {
  Background,
  Controls,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { CompositeMember, WorkflowLink } from '../../api/workflow';

interface ComposerCanvasProps {
  members: CompositeMember[];
  links: WorkflowLink[];
  editable: boolean;
  onCreateLink: (fromWorkflowId: number, toWorkflowId: number) => void;
  onDeleteLink: (linkId: number) => void;
}

function buildNodes(members: CompositeMember[], editable: boolean): Node[] {
  return members.map((m, i) => ({
    id: String(m.workflow.id),
    position: { x: (i % 3) * 260, y: Math.floor(i / 3) * 140 },
    data: { label: m.workflow.name },
    deletable: false,
    connectable: editable,
    style: {
      border: '1px solid #722ed1',
      borderRadius: 8,
      padding: 8,
      background: 'var(--ant-color-bg-container, #fff)',
      fontSize: 12,
    },
  }));
}

function buildEdges(links: WorkflowLink[]): Edge[] {
  return links.map((l) => ({
    id: String(l.id),
    source: String(l.fromWorkflowId),
    target: String(l.toWorkflowId),
    label: l.label ?? undefined,
    animated: true,
  }));
}

export function ComposerCanvas({ members, links, editable, onCreateLink, onDeleteLink }: ComposerCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(buildNodes(members, editable));
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(buildEdges(links));

  useEffect(() => {
    setNodes(buildNodes(members, editable));
  }, [members, editable, setNodes]);

  useEffect(() => {
    setEdges(buildEdges(links));
  }, [links, setEdges]);

  const onConnect = useCallback(
    (c: Connection) => {
      if (c.source && c.target && c.source !== c.target) {
        onCreateLink(Number(c.source), Number(c.target));
      }
    },
    [onCreateLink],
  );

  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      deleted.forEach((e) => onDeleteLink(Number(e.id)));
    },
    [onDeleteLink],
  );

  return (
    <div style={{ height: 520, border: '1px solid rgba(5,5,5,0.06)', borderRadius: 8 }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={editable ? onConnect : undefined}
        onEdgesDelete={editable ? onEdgesDelete : undefined}
        nodesConnectable={editable}
        edgesFocusable={editable}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
