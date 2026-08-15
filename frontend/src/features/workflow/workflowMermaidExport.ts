import type { StepFlagLevel, Workflow, WorkflowPhase, WorkflowStep } from '../../api/workflow';
import { flatten } from './graphLayout';
import { flagMeta } from './stepFlag';

export interface MermaidExportOptions {
  /** Wrap each phase's steps in a Mermaid subgraph. */
  groupByPhase: boolean;
}

// Colored dots so a step's flag reads at a glance inside the node label.
const FLAG_MARK: Record<StepFlagLevel, string> = {
  critical: '\u{1F534}',
  important: '\u{1F7E1}',
  'review-later': '\u26AA',
};

function numberSteps(tree: WorkflowStep[]): Map<number, string> {
  const numbers = new Map<number, string>();
  const walk = (list: WorkflowStep[], prefix: string) => {
    [...list]
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .forEach((s, i) => {
        const num = prefix ? `${prefix}.${i + 1}` : `${i + 1}`;
        numbers.set(s.id, num);
        if (s.children?.length) walk(s.children, num);
      });
  };
  walk(tree, '');
  return numbers;
}

// Mermaid reads quotes/# specially inside labels; encode them so the text survives.
function mmLabel(text: string): string {
  return text
    .replace(/"/g, '#quot;')
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

function htmlEsc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Rollback edges (a transition pointing back to an in-progress ancestor) are drawn dashed.
function findBackTransitions(steps: WorkflowStep[], entryId: number | null): Set<number> {
  const idSet = new Set(steps.map((s) => s.id));
  const adj = new Map<number, { to: number; tid: number }[]>();
  steps.forEach((s) => adj.set(s.id, []));
  steps.forEach((s) =>
    s.transitions.forEach((t) => {
      if (idSet.has(t.toStepId)) adj.get(s.id)!.push({ to: t.toStepId, tid: t.id });
    }),
  );
  const state = new Map<number, 0 | 1 | 2>();
  steps.forEach((s) => state.set(s.id, 0));
  const back = new Set<number>();
  const dfs = (u: number) => {
    state.set(u, 1);
    for (const e of adj.get(u)!) {
      const st = state.get(e.to);
      if (st === 1) back.add(e.tid);
      else if (st === 0) dfs(e.to);
    }
    state.set(u, 2);
  };
  if (entryId != null && idSet.has(entryId)) dfs(entryId);
  steps.forEach((s) => {
    if (state.get(s.id) === 0) dfs(s.id);
  });
  return back;
}

interface ModelStep {
  id: number;
  name: string;
  num: string;
  parent: number | null;
  kids: number[];
  phaseId: number | null;
  role?: string;
  flag?: string;
  tx: { to: number; label: string; back: boolean }[];
}

export interface MermaidModel {
  entry: number | null;
  roots: number[];
  order: number[];
  groupByPhase: boolean;
  phases: { id: number; name: string }[];
  steps: Record<number, ModelStep>;
}

/** Optional label enrichments + rollback/collapse state for source generation. */
export interface GenerateOptions {
  collapsed: Set<number>;
  showRoles?: boolean;
  showFlags?: boolean;
  /** Include dashed rollback (back) edges. Defaults to true. */
  showBack?: boolean;
  /** Prefix expandable/collapsed parents with ▾/▸ affordance carets. */
  carets?: boolean;
}

// A flat, collapse-agnostic description of the tree the embedded script assembles into source.
export function buildMermaidModel(
  tree: WorkflowStep[],
  phases: WorkflowPhase[],
  groupByPhase: boolean,
): MermaidModel {
  const steps = flatten(tree);
  const idSet = new Set(steps.map((s) => s.id));
  const entry = tree[0]?.id ?? null;
  const numbers = numberSteps(tree);
  const backIds = findBackTransitions(steps, entry);

  const parentOf = new Map<number, number | null>();
  const mapParents = (list: WorkflowStep[], parent: number | null) => {
    for (const s of list) {
      parentOf.set(s.id, parent);
      if (s.children?.length) mapParents(s.children, s.id);
    }
  };
  mapParents(tree, null);

  const stepMap: Record<number, ModelStep> = {};
  for (const s of steps) {
    const roleName = s.businessRoles.map((r) => r.name).join(', ').trim();
    const fm = flagMeta(s.flag);
    stepMap[s.id] = {
      id: s.id,
      name: s.name,
      num: numbers.get(s.id) ?? '',
      parent: parentOf.get(s.id) ?? null,
      kids: [...(s.children ?? [])].sort((a, b) => a.orderIndex - b.orderIndex).map((c) => c.id),
      phaseId: s.phase?.id ?? null,
      role: roleName || undefined,
      flag: fm && s.flag ? `${FLAG_MARK[s.flag]} ${fm.label}` : undefined,
      tx: s.transitions
        .filter((t) => idSet.has(t.toStepId))
        .map((t) => ({ to: t.toStepId, label: (t.label ?? '').trim(), back: backIds.has(t.id) })),
    };
  }

  return {
    entry,
    roots: [...tree].sort((a, b) => a.orderIndex - b.orderIndex).map((s) => s.id),
    order: steps.map((s) => s.id),
    groupByPhase,
    phases: [...phases].sort((a, b) => a.orderIndex - b.orderIndex).map((p) => ({ id: p.id, name: p.name })),
    steps: stepMap,
  };
}

// Assemble Mermaid source from the model for a given collapsed set. Mirrors the embedded
// browser copy (generate()) so the exported file re-renders identically on toggle.
export function generateMermaidSource(model: MermaidModel, options: GenerateOptions): string {
  const { collapsed } = options;
  const showBack = options.showBack ?? true;
  const S = model.steps;
  const hasKids = (id: number) => S[id].kids.length > 0;
  const topCollapsed = (id: number): number | null => {
    let p = S[id].parent;
    let top: number | null = null;
    while (p != null) {
      if (collapsed.has(p)) top = p;
      p = S[p].parent;
    }
    return top;
  };
  const isExpandedParent = (id: number) => hasKids(id) && !collapsed.has(id) && topCollapsed(id) === null;
  const endpointId = (id: number): string => {
    const v = topCollapsed(id) ?? id;
    return isExpandedParent(v) ? `sub${v}` : `s${v}`;
  };
  const forwardOut = (id: number) => S[id].tx.filter((t) => !t.back && S[t.to]).length;

  // Fold optional role/flag lines into a step's Mermaid label.
  const decorate = (st: ModelStep, head: string): string => {
    let text = head;
    if (options.showRoles && st.role) text += `<br/>${st.role}`;
    if (options.showFlags && st.flag) text += `<br/>${st.flag}`;
    return mmLabel(text);
  };

  const nodeLines: string[] = [];
  const entryN: string[] = [];
  const decisionN: string[] = [];
  const terminalN: string[] = [];
  const parentN: string[] = [];

  const renderNode = (id: number, indent: string) => {
    const st = S[id];
    const collapsedParent = st.kids.length > 0 && collapsed.has(id);
    const suffix = collapsedParent ? ` (+${st.kids.length})` : '';
    const caret = options.carets && collapsedParent ? '\u25B8 ' : '';
    const label = decorate(st, `${caret}${st.num} ${st.name}${suffix}`.trim());
    let shape: string;
    if (id === model.entry) {
      shape = `s${id}(["${label}"])`;
      entryN.push(`s${id}`);
    } else if (collapsedParent) {
      shape = `s${id}["${label}"]`;
      parentN.push(`s${id}`);
    } else if (forwardOut(id) > 1) {
      shape = `s${id}{"${label}"}`;
      decisionN.push(`s${id}`);
    } else if (st.tx.length === 0) {
      shape = `s${id}["${label}"]`;
      terminalN.push(`s${id}`);
    } else {
      shape = `s${id}["${label}"]`;
    }
    nodeLines.push(indent + shape);
  };

  const renderStep = (id: number, indent: string) => {
    if (isExpandedParent(id)) {
      const st = S[id];
      const caret = options.carets ? '\u25BE ' : '';
      const groupLabel = mmLabel(`${caret}${st.num} ${st.name}`.trim());
      nodeLines.push(`${indent}subgraph sub${id}["${groupLabel}"]`);
      st.kids.forEach((c) => renderStep(c, `${indent}  `));
      nodeLines.push(`${indent}end`);
    } else {
      renderNode(id, indent);
    }
  };

  const usePhases = model.groupByPhase && model.phases.length > 0;
  if (usePhases) {
    const listed = new Set<number>();
    model.phases.forEach((p) => {
      const members = model.roots.filter((id) => S[id].phaseId === p.id);
      if (members.length === 0) return;
      nodeLines.push(`  subgraph phase${p.id}["${mmLabel(p.name)}"]`);
      members.forEach((id) => {
        renderStep(id, '    ');
        listed.add(id);
      });
      nodeLines.push('  end');
    });
    model.roots.filter((id) => !listed.has(id)).forEach((id) => renderStep(id, '  '));
  } else {
    model.roots.forEach((id) => renderStep(id, '  '));
  }

  const edgeLines: string[] = [];
  const seen = new Set<string>();
  for (const id of model.order) {
    for (const t of S[id].tx) {
      if (!S[t.to]) continue;
      if (t.back && !showBack) continue;
      const from = endpointId(id);
      const to = endpointId(t.to);
      if (from === to) continue;
      const arrow = t.back ? '-.->' : '-->';
      const link = t.label ? `${arrow}|"${mmLabel(t.label)}"|` : arrow;
      const line = `  ${from} ${link} ${to}`;
      if (seen.has(line)) continue;
      seen.add(line);
      edgeLines.push(line);
    }
  }

  const lines = ['flowchart TD', ...nodeLines, ...edgeLines];
  lines.push('  classDef entry fill:#f6ffed,stroke:#52c41a,color:#135200;');
  lines.push('  classDef decision fill:#fffbe6,stroke:#faad14,color:#613400;');
  lines.push('  classDef terminal fill:#fafafa,stroke:#8c8c8c,color:#595959;');
  lines.push('  classDef parent fill:#e6f4ff,stroke:#1677ff,color:#003a8c;');
  if (entryN.length) lines.push(`  class ${entryN.join(',')} entry;`);
  if (decisionN.length) lines.push(`  class ${decisionN.join(',')} decision;`);
  if (terminalN.length) lines.push(`  class ${terminalN.join(',')} terminal;`);
  if (parentN.length) lines.push(`  class ${parentN.join(',')} parent;`);
  return lines.join('\n');
}

/** Build the fully-expanded Mermaid `flowchart TD` source for a workflow (steps nested by parent). */
export function buildWorkflowMermaidSource(
  tree: WorkflowStep[],
  phases: WorkflowPhase[],
  options: MermaidExportOptions,
): string {
  const model = buildMermaidModel(tree, phases, options.groupByPhase);
  return generateMermaidSource(model, { collapsed: new Set() });
}

export function buildWorkflowMermaidHtml(
  workflow: Workflow,
  tree: WorkflowStep[],
  phases: WorkflowPhase[],
  options: MermaidExportOptions,
): string {
  const model = buildMermaidModel(tree, phases, options.groupByPhase);
  const modelJson = JSON.stringify(model).replace(/</g, '\\u003c');
  const initialSource = generateMermaidSource(model, { collapsed: new Set() });
  const title = htmlEsc(workflow.name);
  const versionTag = `v${workflow.version}${workflow.isCurrent ? ' · current' : ''}`;
  const generated = new Date().toLocaleString();

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} — Flow diagram (Mermaid)</title>
<style>
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body { margin: 0; display: flex; flex-direction: column; min-height: 100vh; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1f1f1f; background: #f5f5f5; }
  header { padding: 14px 20px; background: #fff; border-bottom: 1px solid #e8e8e8; }
  header h1 { margin: 0; font-size: 18px; }
  header .meta { margin-top: 4px; font-size: 12px; color: #8c8c8c; }
  header .tag { display: inline-block; padding: 1px 8px; border-radius: 10px; background: #e6f4ff; color: #1677ff; font-size: 12px; margin-left: 8px; }
  .stage { position: relative; flex: 1 1 auto; min-height: 360px; overflow: hidden; background: #f5f5f5; cursor: grab; touch-action: none; -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; user-select: none; }
  .stage.panning { cursor: grabbing; }
  .mermaid svg text { pointer-events: none; }
  .viewport { position: absolute; top: 0; left: 0; transform-origin: 0 0; }
  .mermaid { display: inline-block; }
  .mermaid svg { display: block; max-width: none; height: auto; }
  .mermaid .cluster { cursor: pointer; }
  .toolbar { position: absolute; top: 12px; right: 12px; z-index: 5; display: flex; align-items: center; gap: 4px; padding: 4px; background: #fff; border: 1px solid #e8e8e8; border-radius: 8px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
  .toolbar button { min-width: 30px; height: 28px; padding: 0 8px; border: 1px solid #e8e8e8; border-radius: 6px; background: #fff; color: #1f1f1f; font-size: 14px; line-height: 1; cursor: pointer; }
  .toolbar button:hover { background: #f0f7ff; border-color: #91caff; }
  .toolbar .sep { width: 1px; align-self: stretch; margin: 2px 2px; background: #eee; }
  .toolbar .txt { font-size: 12px; }
  .toolbar .zoom-label { min-width: 44px; text-align: center; font-size: 12px; color: #595959; font-variant-numeric: tabular-nums; }
  .hint { position: absolute; bottom: 12px; left: 12px; z-index: 5; font-size: 11px; color: #8c8c8c; background: rgba(255,255,255,0.85); padding: 3px 8px; border-radius: 6px; }
  details { margin: 12px 20px 24px; background: #fff; border: 1px solid #e8e8e8; border-radius: 8px; }
  details summary { cursor: pointer; padding: 8px 12px; font-size: 13px; color: #595959; }
  details pre { margin: 0; padding: 12px; overflow: auto; font-size: 12px; background: #fafafa; border-top: 1px solid #f0f0f0; }
  .fallback { display: none; margin: 20px; padding: 12px 16px; background: #fff2f0; border: 1px solid #ffccc7; border-radius: 8px; color: #a8071a; font-size: 13px; }
  body.failed .fallback { display: block; }
</style>
</head>
<body>
<header>
  <h1>${title}<span class="tag">${htmlEsc(versionTag)}</span></h1>
  <div class="meta">Flow diagram (Mermaid) · generated ${htmlEsc(generated)}</div>
</header>
<div class="fallback">Could not load the Mermaid renderer (offline or blocked). The diagram source is shown below — paste it into any Mermaid viewer.</div>
<div class="stage" id="stage">
  <div class="toolbar">
    <button id="collapseAll" class="txt" title="Collapse every group">Collapse all</button>
    <button id="expandAll" class="txt" title="Expand every group">Expand all</button>
    <span class="sep"></span>
    <button id="zoomOut" title="Zoom out" aria-label="Zoom out">−</button>
    <span class="zoom-label" id="zoomLabel">100%</span>
    <button id="zoomIn" title="Zoom in" aria-label="Zoom in">+</button>
    <button id="zoomFit" title="Fit to window">Fit</button>
    <button id="zoomReset" title="Reset to 100%">1:1</button>
  </div>
  <div class="hint">Click a group to collapse · click a collapsed step to expand · scroll to zoom · drag to pan</div>
  <div class="viewport" id="viewport">
    <pre class="mermaid" id="graph">${htmlEsc(initialSource)}</pre>
  </div>
</div>
<details>
  <summary>View Mermaid source</summary>
  <pre id="sourceView">${htmlEsc(initialSource)}</pre>
</details>
<script type="module">
  var MODEL = ${modelJson};
  var S = MODEL.steps;
  var NUM2ID = {};
  Object.keys(S).forEach(function (k) { NUM2ID[S[k].num] = +k; });
  var collapsed = new Set();
  var mermaid = null;
  var pan = null;
  // Fresh id per render; reusing one container via mermaid.run() leaks ids and drops label text.
  var renderSeq = 0;

  function mmLabel(t) {
    return String(t).replace(/"/g, '#quot;').replace(/[\\r\\n]+/g, ' ').trim();
  }
  function hasKids(id) { return S[id].kids.length > 0; }
  function topCollapsed(id) {
    var p = S[id].parent, top = null;
    while (p != null) { if (collapsed.has(p)) top = p; p = S[p].parent; }
    return top;
  }
  function isExpandedParent(id) { return hasKids(id) && !collapsed.has(id) && topCollapsed(id) === null; }
  function endpointId(id) {
    var t = topCollapsed(id);
    var v = t != null ? t : id;
    return isExpandedParent(v) ? 'sub' + v : 's' + v;
  }
  function forwardOut(id) {
    return S[id].tx.filter(function (t) { return !t.back && S[t.to]; }).length;
  }

  function generate() {
    var nodeLines = [], edgeLines = [], entryN = [], decisionN = [], terminalN = [], parentN = [];
    function renderNode(id, indent) {
      var st = S[id];
      var collapsedParent = st.kids.length > 0 && collapsed.has(id);
      var suffix = collapsedParent ? ' (+' + st.kids.length + ')' : '';
      var prefix = collapsedParent ? '▸ ' : '';
      var head = (prefix + st.num + ' ' + st.name + suffix).trim();
      if (st.role) head += '<br/>' + st.role;
      if (st.flag) head += '<br/>' + st.flag;
      var label = mmLabel(head);
      var shape;
      if (id === MODEL.entry) { shape = 's' + id + '(["' + label + '"])'; entryN.push('s' + id); }
      else if (collapsedParent) { shape = 's' + id + '["' + label + '"]'; parentN.push('s' + id); }
      else if (forwardOut(id) > 1) { shape = 's' + id + '{"' + label + '"}'; decisionN.push('s' + id); }
      else if (st.tx.length === 0) { shape = 's' + id + '["' + label + '"]'; terminalN.push('s' + id); }
      else { shape = 's' + id + '["' + label + '"]'; }
      nodeLines.push(indent + shape);
    }
    function renderStep(id, indent) {
      if (isExpandedParent(id)) {
        var st = S[id];
        nodeLines.push(indent + 'subgraph sub' + id + '["' + mmLabel(('▾ ' + st.num + ' ' + st.name).trim()) + '"]');
        st.kids.forEach(function (c) { renderStep(c, indent + '  '); });
        nodeLines.push(indent + 'end');
      } else {
        renderNode(id, indent);
      }
    }
    var usePhases = MODEL.groupByPhase && MODEL.phases.length > 0;
    if (usePhases) {
      var listed = {};
      MODEL.phases.forEach(function (p) {
        var members = MODEL.roots.filter(function (id) { return S[id].phaseId === p.id; });
        if (members.length === 0) return;
        nodeLines.push('  subgraph phase' + p.id + '["' + mmLabel(p.name) + '"]');
        members.forEach(function (id) { renderStep(id, '    '); listed[id] = 1; });
        nodeLines.push('  end');
      });
      MODEL.roots.filter(function (id) { return !listed[id]; }).forEach(function (id) { renderStep(id, '  '); });
    } else {
      MODEL.roots.forEach(function (id) { renderStep(id, '  '); });
    }
    var seen = {};
    MODEL.order.forEach(function (id) {
      S[id].tx.forEach(function (t) {
        if (!S[t.to]) return;
        var from = endpointId(id), to = endpointId(t.to);
        if (from === to) return;
        var arrow = t.back ? '-.->' : '-->';
        var link = t.label ? arrow + '|"' + mmLabel(t.label) + '"|' : arrow;
        var line = '  ' + from + ' ' + link + ' ' + to;
        if (seen[line]) return;
        seen[line] = 1;
        edgeLines.push(line);
      });
    });
    var lines = ['flowchart TD'].concat(nodeLines).concat(edgeLines);
    lines.push('  classDef entry fill:#f6ffed,stroke:#52c41a,color:#135200;');
    lines.push('  classDef decision fill:#fffbe6,stroke:#faad14,color:#613400;');
    lines.push('  classDef terminal fill:#fafafa,stroke:#8c8c8c,color:#595959;');
    lines.push('  classDef parent fill:#e6f4ff,stroke:#1677ff,color:#003a8c;');
    if (entryN.length) lines.push('  class ' + entryN.join(',') + ' entry;');
    if (decisionN.length) lines.push('  class ' + decisionN.join(',') + ' decision;');
    if (terminalN.length) lines.push('  class ' + terminalN.join(',') + ' terminal;');
    if (parentN.length) lines.push('  class ' + parentN.join(',') + ' parent;');
    return lines.join('\\n');
  }

  // Map by the unique hierarchical number in the label so clicks don't depend on Mermaid's DOM id scheme.
  function labelNum(text) {
    var m = String(text || '').match(/(\\d+(?:\\.\\d+)*)/);
    return m ? m[1] : null;
  }
  function nodeStepId(n) {
    var m = n.id && n.id.match(/flowchart-s(\\d+)/);
    if (m && S[+m[1]]) return +m[1];
    var lbl = n.querySelector('.nodeLabel');
    var num = labelNum(lbl ? lbl.textContent : n.textContent);
    return num != null && NUM2ID[num] != null ? NUM2ID[num] : null;
  }
  function clusterStepId(c) {
    var lbl = c.querySelector('.cluster-label');
    var num = labelNum(lbl ? lbl.textContent : '');
    if (num != null && NUM2ID[num] != null) return NUM2ID[num];
    var m = c.id && c.id.match(/sub(\\d+)/);
    return m ? +m[1] : null;
  }

  // Mermaid left-anchors non-HTML node labels at the box center, so text spills right; re-center them.
  function centerLabels(svg) {
    svg.querySelectorAll('g.node text').forEach(function (t) {
      t.setAttribute('text-anchor', 'middle');
      t.style.textAnchor = 'middle';
      t.querySelectorAll('tspan').forEach(function (ts) { ts.setAttribute('x', '0'); });
    });
  }

  // SVG text can slightly exceed Mermaid's computed viewBox for CJK; grow it so nothing is cropped.
  function unclip(svg) {
    try {
      var bb = svg.getBBox(), M = 8;
      svg.setAttribute('viewBox', (bb.x - M) + ' ' + (bb.y - M) + ' ' + (bb.width + 2 * M) + ' ' + (bb.height + 2 * M));
      svg.style.overflow = 'visible';
    } catch (e) {}
  }

  function attach(svg) {
    svg.querySelectorAll('g.node').forEach(function (n) {
      var id = nodeStepId(n);
      var collapsedParent = id != null && S[id] && S[id].kids.length > 0;
      if (collapsedParent) n.style.cursor = 'pointer';
      n.addEventListener('click', function (e) {
        e.stopPropagation();
        if (collapsedParent) { collapsed.delete(id); rerender(false); }
      });
    });
    svg.querySelectorAll('g.cluster').forEach(function (c) {
      var id = clusterStepId(c);
      if (id == null || !S[id] || S[id].kids.length === 0) return;
      c.style.cursor = 'pointer';
      c.addEventListener('click', function (e) { e.stopPropagation(); collapsed.add(id); rerender(false); });
    });
  }

  async function rerender(doFit) {
    var source = generate();
    var view = document.getElementById('sourceView');
    if (view) view.textContent = source;
    var el = document.getElementById('graph');
    var out;
    try {
      out = await mermaid.render('wfgraph-' + (++renderSeq), source);
    } catch (e) {
      return;
    }
    el.innerHTML = out.svg;
    var svg = el.querySelector('svg');
    if (svg) { centerLabels(svg); unclip(svg); attach(svg); if (pan) pan.bind(svg, doFit); }
  }

  (async function () {
    try {
      mermaid = (await import('https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs')).default;
      mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'strict', suppressErrorRendering: true, fontFamily: '"Segoe UI", "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", "Source Han Sans SC", sans-serif', flowchart: { htmlLabels: false, curve: 'basis' } });
    } catch (err) {
      document.body.classList.add('failed');
      return;
    }
    pan = createPanZoom();
    document.getElementById('collapseAll').addEventListener('click', function () {
      collapsed.clear();
      MODEL.order.forEach(function (id) { if (S[id].kids.length > 0) collapsed.add(id); });
      rerender(true);
    });
    document.getElementById('expandAll').addEventListener('click', function () {
      collapsed.clear();
      rerender(true);
    });
    // Wait for CJK fonts so text is measured correctly; otherwise labels can render empty.
    try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (e) {}
    var el = document.getElementById('graph');
    var source = generate();
    var view = document.getElementById('sourceView');
    if (view) view.textContent = source;
    var out;
    try {
      out = await mermaid.render('wfgraph-' + (++renderSeq), source);
    } catch (e) {
      document.body.classList.add('failed');
      return;
    }
    el.innerHTML = out.svg;
    var svg = el.querySelector('svg');
    if (svg) { centerLabels(svg); unclip(svg); attach(svg); pan.bind(svg, true); }
  })();

  function createPanZoom() {
    const stage = document.getElementById('stage');
    const viewport = document.getElementById('viewport');
    const label = document.getElementById('zoomLabel');
    let svg = null, natW = 0, natH = 0;

    const MIN = 0.1, MAX = 8;
    let scale = 1, tx = 0, ty = 0;
    const clamp = (s) => Math.min(MAX, Math.max(MIN, s));
    function apply() {
      viewport.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')';
      if (label) label.textContent = Math.round(scale * 100) + '%';
    }
    function zoomAt(cx, cy, factor) {
      const next = clamp(scale * factor);
      const k = next / scale;
      tx = cx - k * (cx - tx);
      ty = cy - k * (cy - ty);
      scale = next;
      apply();
    }
    function fit() {
      if (!svg) return;
      const vw = stage.clientWidth, vh = stage.clientHeight, pad = 48;
      scale = clamp(Math.min((vw - pad) / natW, (vh - pad) / natH, 1));
      tx = (vw - natW * scale) / 2;
      ty = (vh - natH * scale) / 2;
      apply();
    }

    stage.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = stage.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
    }, { passive: false });

    let dragging = false, ox = 0, oy = 0;
    stage.addEventListener('pointerdown', (e) => {
      // Let clicks on steps/groups and the toolbar/hint through; pan only from the empty canvas.
      // Capturing the pointer for toolbar clicks would retarget the button's click to the stage.
      if (e.target.closest && e.target.closest('g.node, g.cluster, .toolbar, .hint')) return;
      e.preventDefault();
      var sel = window.getSelection && window.getSelection();
      if (sel && sel.removeAllRanges) sel.removeAllRanges();
      dragging = true; ox = e.clientX - tx; oy = e.clientY - ty;
      viewport.style.willChange = 'transform';
      stage.classList.add('panning');
      stage.setPointerCapture(e.pointerId);
    });
    stage.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      tx = e.clientX - ox; ty = e.clientY - oy; apply();
    });
    const endDrag = () => { dragging = false; viewport.style.willChange = 'auto'; stage.classList.remove('panning'); };
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);

    // Arrow keys pan the canvas; Shift moves faster. Skip when a toolbar button is focused.
    window.addEventListener('keydown', (e) => {
      const map = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
      const dir = map[e.key];
      if (!dir) return;
      var t = e.target;
      if (t && t.closest && t.closest('button, input, textarea, select')) return;
      e.preventDefault();
      const step = e.shiftKey ? 240 : 60;
      tx += dir[0] * step; ty += dir[1] * step; apply();
    });

    const center = () => { const r = stage.getBoundingClientRect(); return [r.width / 2, r.height / 2]; };
    document.getElementById('zoomIn').addEventListener('click', () => { const c = center(); zoomAt(c[0], c[1], 1.2); });
    document.getElementById('zoomOut').addEventListener('click', () => { const c = center(); zoomAt(c[0], c[1], 1 / 1.2); });
    document.getElementById('zoomFit').addEventListener('click', fit);
    document.getElementById('zoomReset').addEventListener('click', () => {
      scale = 1;
      tx = (stage.clientWidth - natW) / 2;
      ty = Math.max(24, (stage.clientHeight - natH) / 2);
      apply();
    });

    return {
      bind: function (newSvg, doFit) {
        svg = newSvg;
        const vb = svg.viewBox && svg.viewBox.baseVal;
        natW = vb && vb.width ? vb.width : svg.getBoundingClientRect().width;
        natH = vb && vb.height ? vb.height : svg.getBoundingClientRect().height;
        svg.style.maxWidth = 'none';
        svg.style.width = natW + 'px';
        svg.style.height = natH + 'px';
        if (doFit) fit(); else apply();
      },
    };
  }
</script>
</body>
</html>`;
}
