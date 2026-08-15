import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Space, Switch, Tag, Typography } from 'antd';
import type { WorkflowPhase, WorkflowStep } from '../../api/workflow';
import { useThemeStore } from '../../theme/themeStore';
import {
  buildMermaidModel,
  generateMermaidSource,
  type MermaidModel,
} from './workflowMermaidExport';

interface WorkflowGraphProps {
  tree: WorkflowStep[];
  phases: WorkflowPhase[];
  selectedId: number | null;
  onSelect: (stepId: number) => void;
}

// Minimal surface of the Mermaid ESM module we actually call.
interface MermaidApi {
  initialize: (config: Record<string, unknown>) => void;
  render: (id: string, source: string) => Promise<{ svg: string }>;
}

interface PanZoom {
  bind: (svg: SVGSVGElement, doFit: boolean) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
  reset: () => void;
  destroy: () => void;
}

// A Mermaid-rendered node maps back to a step via its DOM id (flowchart-s<id>-N).
function nodeStepId(el: Element, model: MermaidModel): number | null {
  const m = /flowchart-s(\d+)/.exec(el.id ?? '');
  const id = m ? Number(m[1]) : Number.NaN;
  return model.steps[id] ? id : null;
}

// A cluster is a step group only when its id is sub<id> (phase clusters are phase<id>).
function clusterStepId(el: Element, model: MermaidModel): number | null {
  const m = /sub(\d+)/.exec(el.id ?? '');
  const id = m ? Number(m[1]) : Number.NaN;
  return model.steps[id] && model.steps[id].kids.length > 0 ? id : null;
}

function createPanZoom(
  stage: HTMLDivElement,
  viewport: HTMLDivElement,
  onZoom: (scale: number) => void,
): PanZoom {
  const MIN = 0.1;
  const MAX = 8;
  let svg: SVGSVGElement | null = null;
  let natW = 0;
  let natH = 0;
  let scale = 1;
  let tx = 0;
  let ty = 0;
  const clamp = (s: number) => Math.min(MAX, Math.max(MIN, s));
  const apply = () => {
    viewport.style.transform = `translate(${tx}px,${ty}px) scale(${scale})`;
    onZoom(scale);
  };
  const zoomAt = (cx: number, cy: number, factor: number) => {
    const next = clamp(scale * factor);
    const k = next / scale;
    tx = cx - k * (cx - tx);
    ty = cy - k * (cy - ty);
    scale = next;
    apply();
  };
  const fit = () => {
    if (!svg || !natW || !natH) return;
    const vw = stage.clientWidth;
    const vh = stage.clientHeight;
    const pad = 48;
    scale = clamp(Math.min((vw - pad) / natW, (vh - pad) / natH, 1));
    tx = (vw - natW * scale) / 2;
    ty = (vh - natH * scale) / 2;
    apply();
  };
  const center = (): [number, number] => {
    const r = stage.getBoundingClientRect();
    return [r.width / 2, r.height / 2];
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const r = stage.getBoundingClientRect();
    zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
  };
  let dragging = false;
  let ox = 0;
  let oy = 0;
  const onDown = (e: PointerEvent) => {
    // Let clicks on steps/groups through so select + collapse works; pan only from empty canvas.
    if ((e.target as Element).closest?.('g.node, g.cluster')) return;
    dragging = true;
    // Promote to a GPU layer only while dragging; a permanent one caches a blurry raster.
    viewport.style.willChange = 'transform';
    ox = e.clientX - tx;
    oy = e.clientY - ty;
    stage.style.cursor = 'grabbing';
    stage.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    tx = e.clientX - ox;
    ty = e.clientY - oy;
    apply();
  };
  const endDrag = () => {
    dragging = false;
    // Drop the cached layer so the browser re-rasterizes the SVG crisply at the current scale.
    viewport.style.willChange = 'auto';
    stage.style.cursor = 'grab';
  };
  stage.addEventListener('wheel', onWheel, { passive: false });
  stage.addEventListener('pointerdown', onDown);
  stage.addEventListener('pointermove', onMove);
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  return {
    bind(nextSvg, doFit) {
      svg = nextSvg;
      const vb = nextSvg.viewBox?.baseVal;
      if (vb?.width) {
        natW = vb.width;
        natH = vb.height;
      } else {
        const box = nextSvg.getBBox();
        natW = box.width;
        natH = box.height;
      }
      if (doFit) fit();
      else apply();
    },
    zoomIn() {
      const [cx, cy] = center();
      zoomAt(cx, cy, 1.2);
    },
    zoomOut() {
      const [cx, cy] = center();
      zoomAt(cx, cy, 1 / 1.2);
    },
    fit,
    reset() {
      scale = 1;
      const [cx, cy] = center();
      tx = cx - natW / 2;
      ty = cy - natH / 2;
      apply();
    },
    destroy() {
      stage.removeEventListener('wheel', onWheel);
      stage.removeEventListener('pointerdown', onDown);
      stage.removeEventListener('pointermove', onMove);
      stage.removeEventListener('pointerup', endDrag);
      stage.removeEventListener('pointercancel', endDrag);
    },
  };
}

export function WorkflowGraph({ tree, phases, selectedId, onSelect }: Readonly<WorkflowGraphProps>) {
  const mode = useThemeStore((s) => s.mode);
  const hasPhases = phases.length > 0;
  const [showRollback, setShowRollback] = useState(true);
  const [showPhases, setShowPhases] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set());
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [zoomPct, setZoomPct] = useState(100);
  const [renderNonce, setRenderNonce] = useState(0);

  const mermaidRef = useRef<MermaidApi | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<PanZoom | null>(null);
  const fittedRef = useRef(false);
  const refitNextRef = useRef(false);

  const usePhases = hasPhases && showPhases;
  const model = useMemo(() => buildMermaidModel(tree, phases, usePhases), [tree, phases, usePhases]);
  const source = useMemo(
    () =>
      generateMermaidSource(model, {
        collapsed,
        showRoles: true,
        showFlags: true,
        showBack: showRollback,
        carets: true,
      }),
    [model, collapsed, showRollback],
  );

  const collapseStep = (id: number) =>
    setCollapsed((prev) => new Set(prev).add(id));
  const expandStep = (id: number) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

  // Load Mermaid lazily (only when the graph view mounts).
  useEffect(() => {
    let cancelled = false;
    import('mermaid')
      .then((mod) => {
        if (cancelled) return;
        mermaidRef.current = mod.default as unknown as MermaidApi;
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // (Re)initialize theme whenever the app theme flips.
  useEffect(() => {
    if (!ready || !mermaidRef.current) return;
    mermaidRef.current.initialize({
      startOnLoad: false,
      theme: mode === 'dark' ? 'dark' : 'neutral',
      securityLevel: 'strict',
      suppressErrorRendering: true,
      // htmlLabels:false keeps labels as SVG <text> so they stay crisp under CSS scale.
      flowchart: { htmlLabels: false, curve: 'basis' },
    });
    setRenderNonce((n) => n + 1);
  }, [ready, mode]);

  // Set up pan/zoom once the stage is mounted.
  useEffect(() => {
    if (!ready || !stageRef.current || !viewportRef.current || panRef.current) return;
    panRef.current = createPanZoom(stageRef.current, viewportRef.current, (s) =>
      setZoomPct(Math.round(s * 100)),
    );
    return () => {
      panRef.current?.destroy();
      panRef.current = null;
    };
  }, [ready]);

  // Render the diagram whenever the source (or theme) changes.
  useEffect(() => {
    if (!ready || !mermaidRef.current || !graphRef.current) return;
    let cancelled = false;
    const host = graphRef.current;
    const run = async () => {
      let svgCode: string;
      try {
        const res = await mermaidRef.current!.render(`wfgraph-${renderNonce}-${Date.now()}`, source);
        svgCode = res.svg;
      } catch {
        if (!cancelled) setFailed(true);
        return;
      }
      if (cancelled) return;
      setFailed(false);
      host.innerHTML = svgCode;
      const svg = host.querySelector('svg');
      if (!svg) return;
      svg.removeAttribute('height');
      svg.style.maxWidth = 'none';

      svg.querySelectorAll('g.node').forEach((n) => {
        const id = nodeStepId(n, model);
        if (id == null) return;
        const collapsedParent = model.steps[id].kids.length > 0;
        (n as HTMLElement).style.cursor = 'pointer';
        n.addEventListener('click', (e) => {
          e.stopPropagation();
          onSelect(id);
          if (collapsedParent) expandStep(id);
        });
      });
      svg.querySelectorAll('g.cluster').forEach((c) => {
        const id = clusterStepId(c, model);
        if (id == null) return;
        (c as HTMLElement).style.cursor = 'pointer';
        c.addEventListener('click', (e) => {
          e.stopPropagation();
          onSelect(id);
          collapseStep(id);
        });
      });

      const doFit = !fittedRef.current || refitNextRef.current;
      fittedRef.current = true;
      refitNextRef.current = false;
      panRef.current?.bind(svg as SVGSVGElement, doFit);
      setRenderNonce((n) => n + 1);
    };
    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, ready, mode]);

  // Highlight the selected step without re-rendering the whole diagram.
  useEffect(() => {
    const host = graphRef.current;
    const svg = host?.querySelector('svg');
    if (!svg) return;
    svg
      .querySelectorAll('.wf-node-selected, .wf-cluster-selected')
      .forEach((el) => el.classList.remove('wf-node-selected', 'wf-cluster-selected'));
    if (selectedId == null) return;
    const node = [...svg.querySelectorAll('g.node')].find((n) => nodeStepId(n, model) === selectedId);
    if (node) {
      node.classList.add('wf-node-selected');
      return;
    }
    const cluster = [...svg.querySelectorAll('g.cluster')].find(
      (c) => clusterStepId(c, model) === selectedId,
    );
    if (cluster) cluster.classList.add('wf-cluster-selected');
  }, [selectedId, renderNonce, model]);

  const collapseAll = () => {
    refitNextRef.current = true;
    const next = new Set<number>();
    Object.values(model.steps).forEach((s) => {
      if (s.kids.length > 0) next.add(s.id);
    });
    setCollapsed(next);
  };
  const expandAll = () => {
    refitNextRef.current = true;
    setCollapsed(new Set());
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <style>{`
        .wf-node-selected > rect,
        .wf-node-selected > polygon,
        .wf-node-selected > path,
        .wf-node-selected > circle { stroke: #1677ff !important; stroke-width: 3px !important; }
        .wf-cluster-selected > rect { stroke: #1677ff !important; stroke-width: 2px !important; }
      `}</style>
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
        <Space size={4}>
          <Button size="small" onClick={collapseAll}>
            Collapse all
          </Button>
          <Button size="small" onClick={expandAll}>
            Expand all
          </Button>
        </Space>
        <Space size={12} style={{ fontSize: 11 }}>
          <span style={{ color: '#52c41a' }}>▶ Entry</span>
          <span style={{ color: '#faad14' }}>◆ Decision</span>
          <Tag color="red" style={{ margin: 0 }}>
            rollback
          </Tag>
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
            click a step to open it · click a group to collapse
          </Typography.Text>
        </Space>
      </Space>
      <div
        ref={stageRef}
        style={{
          position: 'relative',
          height: 620,
          overflow: 'hidden',
          border: '1px solid rgba(5,5,5,0.06)',
          borderRadius: 8,
          background: 'var(--ant-color-bg-layout, #f5f5f5)',
          cursor: 'grab',
          touchAction: 'none',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            zIndex: 5,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <Button size="small" onClick={() => panRef.current?.zoomOut()} aria-label="Zoom out">
            −
          </Button>
          <span
            style={{
              minWidth: 44,
              textAlign: 'center',
              fontSize: 12,
              color: '#595959',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {zoomPct}%
          </span>
          <Button size="small" onClick={() => panRef.current?.zoomIn()} aria-label="Zoom in">
            +
          </Button>
          <Button size="small" onClick={() => panRef.current?.fit()}>
            Fit
          </Button>
          <Button size="small" onClick={() => panRef.current?.reset()}>
            1:1
          </Button>
        </div>
        {failed && (
          <div
            style={{
              position: 'absolute',
              top: 12,
              left: 12,
              zIndex: 5,
              maxWidth: 360,
              padding: '8px 12px',
              background: '#fff2f0',
              border: '1px solid #ffccc7',
              borderRadius: 8,
              color: '#a8071a',
              fontSize: 12,
            }}
          >
            Could not render the diagram. If this persists, reload the page.
          </div>
        )}
        <div
          ref={viewportRef}
          style={{ position: 'absolute', top: 0, left: 0, transformOrigin: '0 0' }}
        >
          <div ref={graphRef} style={{ display: 'inline-block' }} />
        </div>
      </div>
    </div>
  );
}
