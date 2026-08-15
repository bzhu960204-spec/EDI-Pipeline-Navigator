import type { Transition, Workflow, WorkflowPhase, WorkflowStep } from '../../api/workflow';
import { flagMeta } from './stepFlag';

export interface DocExportOptions {
  /** Group root steps under phase headings (falls back to a flat list when off or no phases). */
  groupByPhase: boolean;
  includeReviews: boolean;
  /** Personal importance marks are private, so they are off by default. */
  includeFlags: boolean;
}

interface DocSection {
  title: string | null;
  color: string | null;
  roots: WorkflowStep[];
}

// Deterministic hex swatch for free-text tags (AntD tokens aren't valid CSS colors).
const TAG_HEX = [
  '#eb2f96', '#f5222d', '#fa541c', '#fa8c16', '#faad14',
  '#a0d911', '#52c41a', '#13c2c2', '#1677ff', '#2f54eb', '#722ed1',
];

function tagHex(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = Math.trunc(hash * 31 + (name.codePointAt(i) ?? 0));
  return TAG_HEX[Math.abs(hash) % TAG_HEX.length];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function nl2br(value: string): string {
  return escapeHtml(value).replace(/\r?\n/g, '<br />');
}

function buildSections(
  tree: WorkflowStep[],
  phases: WorkflowPhase[],
  groupByPhase: boolean,
): DocSection[] {
  if (!groupByPhase || phases.length === 0) {
    return [{ title: null, color: null, roots: tree }];
  }
  const sections: DocSection[] = [];
  [...phases]
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .forEach((phase) => {
      const roots = tree.filter((s) => s.phase?.id === phase.id);
      if (roots.length > 0) {
        sections.push({ title: phase.name, color: phase.color ?? null, roots });
      }
    });
  const ungrouped = tree.filter((s) => !s.phase);
  if (ungrouped.length > 0) {
    sections.push({ title: 'Ungrouped', color: null, roots: ungrouped });
  }
  return sections;
}

/** Precompute id -> "1.2.3" numbers over the rendered order so cross-references stay consistent. */
function numberSteps(sections: DocSection[]): Map<number, string> {
  const numbers = new Map<number, string>();
  let rootIndex = 0;
  const walk = (steps: WorkflowStep[], prefix: string) => {
    steps
      .slice()
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .forEach((step, i) => {
        let number: string;
        if (prefix) {
          number = `${prefix}.${i + 1}`;
        } else {
          rootIndex += 1;
          number = `${rootIndex}`;
        }
        numbers.set(step.id, number);
        if (step.children?.length) walk(step.children, number);
      });
  };
  sections.forEach((section) => walk(section.roots, ''));
  return numbers;
}

interface TransitionGroup {
  label: string | null;
  targets: Transition[];
}

function groupTransitions(transitions: Transition[]): TransitionGroup[] {
  const byGroup = new Map<string, TransitionGroup>();
  const order: string[] = [];
  transitions
    .slice()
    .sort((a, b) => a.groupOrderIndex - b.groupOrderIndex || a.orderIndex - b.orderIndex)
    .forEach((t) => {
      const key = t.groupId != null ? `g${t.groupId}` : `s${t.id}`;
      if (!byGroup.has(key)) {
        byGroup.set(key, { label: t.label ?? null, targets: [] });
        order.push(key);
      }
      byGroup.get(key)!.targets.push(t);
    });
  return order.map((k) => byGroup.get(k)!);
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

interface IncomingRef {
  fromId: number;
  label: string | null;
}

interface DocContext {
  numbers: Map<number, string>;
  nameById: Map<number, string>;
  /** toStepId -> list of steps that transition into it, for "Previous" backlinks. */
  incoming: Map<number, IncomingRef[]>;
  /** coFireGroupId -> the arrivals that must all fire together (AND). */
  coFire: Map<number, IncomingRef[]>;
}

function flattenSteps(tree: WorkflowStep[]): WorkflowStep[] {
  const out: WorkflowStep[] = [];
  const walk = (list: WorkflowStep[]) =>
    list.forEach((s) => {
      out.push(s);
      if (s.children?.length) walk(s.children);
    });
  walk(tree);
  return out;
}

function buildContext(tree: WorkflowStep[], numbers: Map<number, string>): DocContext {
  const all = flattenSteps(tree);
  const nameById = new Map<number, string>();
  const incoming = new Map<number, IncomingRef[]>();
  const coFire = new Map<number, IncomingRef[]>();
  all.forEach((s) => nameById.set(s.id, s.name));
  all.forEach((s) => {
    s.transitions.forEach((t) => {
      if (!incoming.has(t.toStepId)) incoming.set(t.toStepId, []);
      incoming.get(t.toStepId)!.push({ fromId: s.id, label: t.label ?? null });
      if (t.coFireGroupId != null) {
        if (!coFire.has(t.coFireGroupId)) coFire.set(t.coFireGroupId, []);
        coFire.get(t.coFireGroupId)!.push({ fromId: s.id, label: t.label ?? null });
      }
    });
  });
  return { numbers, nameById, incoming, coFire };
}

function renderPrevious(step: WorkflowStep, ctx: DocContext): string {
  const inc = ctx.incoming.get(step.id);
  if (!inc || inc.length === 0) return '';
  const rows = inc
    .map((ref) => {
      const num = ctx.numbers.get(ref.fromId);
      const name = ctx.nameById.get(ref.fromId) ?? '';
      const refNum = num ? `<span class="ref">${escapeHtml(num)}</span> ` : '';
      const label = ref.label ? `<span class="cond">${escapeHtml(ref.label)}</span> ` : '';
      return `<li>${label}<span class="arrow">&larr;</span> <a class="xref" href="#s${ref.fromId}">${refNum}${escapeHtml(name)}</a></li>`;
    })
    .join('');
  return `<div class="prev"><span class="prev-title">Previous</span><ul>${rows}</ul></div>`;
}

function renderNext(step: WorkflowStep, ctx: DocContext): string {
  if (step.transitions.length === 0) return '';
  const groups = groupTransitions(step.transitions);
  const isDecision = groups.length > 1;
  const rows = groups
    .map((group) => {
      const targets = group.targets
        .map((t) => {
          const num = ctx.numbers.get(t.toStepId);
          const coFire = renderCoFirePill(step, t, ctx);
          const ref = num ? `<span class="ref">${escapeHtml(num)}</span> ` : '';
          return `<a class="xref" href="#s${t.toStepId}">${ref}${escapeHtml(t.toStepName)}</a>${coFire}`;
        })
        .join(group.targets.length > 1 ? ' <span class="op">&amp;</span> ' : '');
      const parallel = group.targets.length > 1 ? ' <span class="pill parallel">parallel</span>' : '';
      // Condition label is already a full phrase, so it is shown verbatim (no injected "If").
      const label = group.label ? `<span class="cond">${escapeHtml(group.label)}</span> ` : '';
      return `<li>${label}<span class="arrow">&rarr;</span> ${targets}${parallel}</li>`;
    })
    .join('');
  const heading = isDecision ? 'Branches to' : 'Next';
  return `<div class="next"><span class="next-title">${heading}</span><ul>${rows}</ul></div>`;
}

// Co-fire pill with a hover tooltip listing the other arrivals in the same group.
function renderCoFirePill(step: WorkflowStep, t: Transition, ctx: DocContext): string {
  if (t.coFireGroupId == null) return '';
  const others = (ctx.coFire.get(t.coFireGroupId) ?? []).filter((m) => m.fromId !== step.id);
  const items = others
    .map((m) => {
      const num = ctx.numbers.get(m.fromId);
      const ref = num ? `<span class="ref">${escapeHtml(num)}</span> ` : '';
      const label = m.label ? `<span class="cond">${escapeHtml(m.label)}</span> ` : '';
      const name = ctx.nameById.get(m.fromId) ?? '';
      return `<li>${label}<a class="xref" href="#s${m.fromId}">${ref}${escapeHtml(name)}</a></li>`;
    })
    .join('');
  const body = items
    ? `<span class="cofire-tip-title">Co-fires with:</span><ul>${items}</ul>`
    : '<span class="cofire-tip-title">No other arrivals in this group.</span>';
  return ` <span class="cofire-wrap"><span class="pill cofire">co-fire</span><span class="cofire-tip">${body}</span></span>`;
}

function renderBadges(step: WorkflowStep): string {
  const groups = groupTransitions(step.transitions);
  const badges: string[] = [];
  if (groups.length > 1) badges.push(`<span class="badge decision">Decision &times;${groups.length}</span>`);
  if (groups.some((g) => g.targets.length > 1)) badges.push('<span class="badge parallel">Parallel</span>');
  if (step.transitions.some((t) => t.coFireGroupId != null)) badges.push('<span class="badge cofire">Co-fire</span>');
  if (step.transitions.length === 0 && !step.children?.length) badges.push('<span class="badge end">End</span>');
  return badges.join('');
}

function renderStep(
  step: WorkflowStep,
  ctx: DocContext,
  options: DocExportOptions,
  depth: number,
): string {
  const number = ctx.numbers.get(step.id) ?? '';
  const roles = step.businessRoles
    .map(
      (r) =>
        `<span class="tag" style="border-color:${r.color ?? '#bfbfbf'};color:${r.color ?? '#595959'}">${escapeHtml(r.name)}</span>`,
    )
    .join('');
  const flag = options.includeFlags ? flagMeta(step.flag) : undefined;
  const flagChip = flag
    ? `<span class="flag" style="background:${flag.color}"></span><span class="flag-label">${escapeHtml(flag.label)}</span>`
    : '';
  const description = step.description
    ? `<p class="desc">${nl2br(step.description)}</p>`
    : '';
  const notes = step.notes ? `<div class="notes"><span>Notes</span>${nl2br(step.notes)}</div>` : '';
  const reviews =
    options.includeReviews && step.reviews.length > 0
      ? `<div class="reviews"><span>Reviews</span><ul>${step.reviews
          .map((r) => `<li>${nl2br(r.content)}</li>`)
          .join('')}</ul></div>`
      : '';
  const previous = renderPrevious(step, ctx);
  const next = renderNext(step, ctx);
  const hasChildren = !!step.children?.length;
  const children = hasChildren
    ? step
        .children!.slice()
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((c) => renderStep(c, ctx, options, depth + 1))
        .join('')
    : '';
  const headingLevel = Math.min(depth + 3, 6);
  // Every step is collapsible so a fully-collapsed doc shows a consistent title-only outline.
  const toggle = '<button class="toggle" type="button" aria-label="Toggle details"></button>';
  const searchText = escapeAttr(
    [number, step.name, step.businessRoles.map((r) => r.name).join(' '), step.description ?? '', step.notes ?? '']
      .join(' ')
      .toLowerCase(),
  );
  return `
    <section class="step step-d${Math.min(depth, 4)}${hasChildren ? ' has-children' : ''} collapsed" id="s${step.id}" data-text="${searchText}">
      <div class="step-head">
        ${toggle}
        <h${headingLevel} class="step-title">
          <span class="num">${escapeHtml(number)}</span>
          <span class="step-name">${escapeHtml(step.name)}</span>
          ${renderBadges(step)}
          ${flagChip}
        </h${headingLevel}>
      </div>
      <div class="step-body">
        ${roles ? `<div class="roles">${roles}</div>` : ''}
        ${description}
        ${notes}
        ${reviews}
        ${previous}
        ${next}
        ${
          children
            ? `<div class="kids"><button class="kids-toggle" type="button">Collapse sub-steps</button><div class="children">${children}</div></div>`
            : ''
        }
      </div>
    </section>`;
}

function renderToc(sections: DocSection[], ctx: DocContext): string {
  const items: string[] = [];
  const walk = (steps: WorkflowStep[], depth: number) => {
    steps
      .slice()
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .forEach((s) => {
        const num = ctx.numbers.get(s.id) ?? '';
        items.push(
          `<a class="xref toc-link toc-l${Math.min(depth, 3)}" href="#s${s.id}"><span class="ref">${escapeHtml(num)}</span> ${escapeHtml(s.name)}</a>`,
        );
        if (s.children?.length) walk(s.children, depth + 1);
      });
  };
  sections.forEach((sec) => {
    if (sec.title != null) items.push(`<div class="toc-phase">${escapeHtml(sec.title)}</div>`);
    walk(sec.roots, 0);
  });
  return `<aside class="toc no-print" id="toc"><div class="toc-head">Outline</div><nav>${items.join('')}</nav></aside>`;
}

function renderToolbar(workflow: Workflow): string {
  return `
    <div class="toolbar no-print">
      <span class="tb-title">${escapeHtml(workflow.name)}</span>
      <input type="search" id="searchBox" class="tb-search" placeholder="Search steps, roles, text..." />
      <div class="tb-actions">
        <button type="button" id="tocToggle">Outline</button>
        <button type="button" id="expandAll">Expand all</button>
        <button type="button" id="collapseAll">Collapse all</button>
        <div class="dropdown">
          <button type="button" id="displayBtn">Display &#9662;</button>
          <div class="dropdown-menu" id="displayMenu" hidden>
            <button type="button" class="tgl off" data-cls="hide-roles">Roles</button>
            <button type="button" class="tgl off" data-cls="hide-previous">Previous</button>
            <button type="button" class="tgl" data-cls="hide-next">Next steps</button>
            <button type="button" class="tgl" data-cls="hide-notes">Notes</button>
            <button type="button" class="tgl off" data-cls="hide-reviews">Reviews</button>
          </div>
        </div>
        <button type="button" id="printBtn">Print</button>
      </div>
    </div>`;
}

function renderHeader(workflow: Workflow): string {
  const label = workflow.versionLabel ? ` · ${escapeHtml(workflow.versionLabel)}` : '';
  const version = `v${workflow.version}${label}`;
  const tags = workflow.tags.length
    ? `<div class="wf-tags">${workflow.tags
        .map((t) => `<span class="tag" style="border-color:${tagHex(t)};color:${tagHex(t)}">${escapeHtml(t)}</span>`)
        .join('')}</div>`
    : '';
  const description = workflow.description
    ? `<p class="wf-desc">${nl2br(workflow.description)}</p>`
    : '';
  const meta = [
    `<span class="status status-${workflow.status.toLowerCase()}">${workflow.status}</span>`,
    `<span class="chip">${escapeHtml(version)}</span>`,
    `<span class="chip">Confidence: ${workflow.confidence}%</span>`,
    `<span class="chip">${workflow.stepCount} steps</span>`,
  ].join('');
  return `
    <header class="wf-header">
      <h1>${escapeHtml(workflow.name)}</h1>
      <div class="wf-meta">${meta}</div>
      ${tags}
      ${description}
      <p class="exported">Exported ${new Date().toLocaleString()}</p>
    </header>`;
}

function renderLegend(options: DocExportOptions): string {
  const items = [
    '<li><span class="arrow">&rarr;</span> a transition to the next step (click a link to jump)</li>',
    '<li><span class="badge decision">Decision &times;N</span> the step branches into N conditions</li>',
    '<li><span class="badge parallel">Parallel</span> the listed targets all start together</li>',
    '<li><span class="badge cofire">Co-fire</span> the target waits until every co-firing exit has arrived</li>',
    '<li><span class="badge end">End</span> a terminal step with no outgoing transition</li>',
    '<li><span class="cond">condition</span> the label that selects a branch</li>',
    '<li><span class="arrow">&larr;</span> a <b>Previous</b> link back to a step that leads here</li>',
    '<li><span class="tag" style="border-color:#1677ff;color:#1677ff">Role</span> the responsible business role(s) for a step</li>',
  ];
  if (options.includeFlags) {
    items.push('<li><span class="flag" style="background:#ff4d4f"></span> a personal importance mark</li>');
  }
  return `<section class="legend"><h2>Legend</h2><ul>${items.join('')}</ul></section>`;
}

const STYLES = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #f0f2f5; color: #1f1f1f; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; line-height: 1.55; }
  .toolbar { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 40px; background: #001529; color: #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.15); }
  .tb-title { font-weight: 600; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tb-actions { display: flex; gap: 8px; flex: 0 0 auto; }
  .toolbar button { cursor: pointer; border: 1px solid rgba(255,255,255,0.25); background: rgba(255,255,255,0.1); color: #fff; border-radius: 4px; padding: 4px 12px; font-size: 13px; }
  .toolbar button:hover { background: rgba(255,255,255,0.2); }
  .tb-search { flex: 1 1 auto; max-width: 360px; min-width: 120px; border: 1px solid rgba(255,255,255,0.25); background: rgba(255,255,255,0.12); color: #fff; border-radius: 4px; padding: 5px 10px; font-size: 13px; }
  .tb-search::placeholder { color: rgba(255,255,255,0.6); }
  .dropdown { position: relative; display: inline-block; }
  .dropdown-menu { position: absolute; right: 0; top: calc(100% + 6px); background: #fff; border-radius: 6px; box-shadow: 0 4px 16px rgba(0,0,0,0.2); padding: 6px; display: flex; flex-direction: column; gap: 4px; min-width: 150px; z-index: 20; }
  .dropdown-menu[hidden] { display: none; }
  .dropdown-menu .tgl { color: #262626; background: #fff; border: 1px solid transparent; text-align: left; padding: 5px 10px; border-radius: 4px; }
  .dropdown-menu .tgl::before { content: '\\2713 '; color: #52c41a; }
  .dropdown-menu .tgl:hover { background: #f5f5f5; }
  .dropdown-menu .tgl.off { color: #bfbfbf; text-decoration: line-through; }
  .dropdown-menu .tgl.off::before { content: '\\2003 '; }
  .layout { display: flex; gap: 24px; max-width: 1260px; margin: 0 auto; align-items: flex-start; }
  .toc { flex: 0 0 250px; position: sticky; top: 56px; max-height: calc(100vh - 72px); overflow: auto; background: #fff; border-radius: 8px; box-shadow: 0 1px 8px rgba(0,0,0,0.08); padding: 12px 8px; margin-top: 24px; font-size: 13px; }
  .toc-head { font-weight: 700; color: #8c8c8c; text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em; padding: 0 8px 8px; }
  .toc nav { display: flex; flex-direction: column; }
  .toc-link { display: block; padding: 3px 8px; border-radius: 4px; border-bottom: none; color: #262626; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .toc-link:hover { background: #e6f4ff; }
  .toc-l1 { padding-left: 20px; }
  .toc-l2 { padding-left: 32px; }
  .toc-l3 { padding-left: 44px; }
  .toc-phase { font-weight: 600; color: #595959; padding: 8px 8px 2px; }
  body.toc-hidden .toc { display: none; }
  body.toc-hidden .layout { justify-content: center; }
  body.hide-roles .roles, body.hide-notes .notes, body.hide-reviews .reviews, body.hide-next .next, body.hide-previous .prev { display: none !important; }
  .step.search-hidden { display: none; }
  .page { flex: 1 1 auto; max-width: 960px; margin: 24px 0; padding: 32px 40px 64px; background: #fff; box-shadow: 0 1px 8px rgba(0,0,0,0.08); }
  .wf-header { border-bottom: 2px solid #f0f0f0; padding-bottom: 20px; margin-bottom: 24px; }
  .wf-header h1 { margin: 0 0 12px; font-size: 26px; }
  .wf-meta { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 10px; }
  .chip { background: #f5f5f5; border-radius: 4px; padding: 2px 8px; font-size: 12px; color: #595959; }
  .status { border-radius: 4px; padding: 2px 8px; font-size: 12px; font-weight: 600; }
  .status-draft { background: #fff7e6; color: #d46b08; }
  .status-published { background: #f6ffed; color: #389e0d; }
  .wf-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
  .wf-desc { color: #434343; white-space: normal; margin: 8px 0 0; }
  .exported { color: #8c8c8c; font-size: 12px; margin: 12px 0 0; }
  .phase-section { margin: 28px 0 8px; }
  .phase-head { width: 100%; text-align: left; cursor: pointer; display: flex; align-items: center; gap: 8px; padding: 8px 12px; border: none; border-left: 5px solid #d9d9d9; border-radius: 6px; background: #fafafa; font-size: 17px; font-weight: 600; color: #1f1f1f; }
  .phase-head .tw { transition: transform 0.15s; color: #8c8c8c; font-size: 12px; }
  .phase-section.collapsed .phase-head .tw { transform: rotate(-90deg); }
  .phase-section.collapsed > .phase-body { display: none; }
  .step { margin: 12px 0; scroll-margin-top: 64px; }
  .step-head { display: flex; align-items: baseline; gap: 6px; }
  .toggle { flex: 0 0 auto; cursor: pointer; width: 18px; height: 18px; margin-top: 4px; border: 1px solid #d9d9d9; border-radius: 4px; background: #fff; color: #595959; font-size: 11px; line-height: 1; padding: 0; }
  .toggle::before { content: '\\25be'; }
  .step.collapsed > .step-head .toggle::before { content: '\\25b8'; }
  .toggle-spacer { flex: 0 0 auto; width: 18px; }
  .step-body { padding-left: 24px; border-left: 2px solid #f0f0f0; margin-left: 8px; }
  .step.collapsed > .step-body { display: none; }
  .step-title { display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px; margin: 4px 0; font-size: 15px; }
  .num { color: #1677ff; font-variant-numeric: tabular-nums; font-weight: 600; }
  .step-name { font-weight: 600; }
  .roles { display: flex; flex-wrap: wrap; gap: 6px; margin: 2px 0 6px; }
  .tag { border: 1px solid; border-radius: 4px; padding: 0 7px; font-size: 12px; line-height: 20px; display: inline-block; background: #fff; }
  .badge { border-radius: 4px; padding: 0 7px; font-size: 11px; font-weight: 600; line-height: 18px; }
  .badge.decision { background: #e6f4ff; color: #0958d9; border: 1px solid #91caff; }
  .badge.parallel { background: #f6ffed; color: #389e0d; border: 1px solid #b7eb8f; }
  .badge.cofire { background: #fff1f0; color: #cf1322; border: 1px solid #ffa39e; }
  .badge.end { background: #f5f5f5; color: #595959; border: 1px solid #d9d9d9; }
  .desc { margin: 4px 0; color: #262626; }
  .notes, .reviews { margin: 6px 0; padding: 8px 12px; border-radius: 6px; font-size: 13px; }
  .notes { background: #fffbe6; border: 1px solid #ffe58f; color: #614700; }
  .reviews { background: #f0f5ff; border: 1px solid #adc6ff; color: #1d39c4; }
  .notes span, .reviews span { display: block; font-weight: 600; margin-bottom: 4px; opacity: 0.8; }
  .reviews ul { margin: 0; padding-left: 18px; }
  .next { margin: 6px 0; font-size: 13px; }
  .next-title { display: inline-block; font-weight: 600; color: #595959; margin-right: 6px; }
  .next ul { margin: 4px 0 0; padding-left: 18px; }
  .next li { margin: 2px 0; }
  .prev { margin: 6px 0; font-size: 13px; }
  .prev-title { display: inline-block; font-weight: 600; color: #8c8c8c; margin-right: 6px; }
  .prev ul { margin: 4px 0 0; padding-left: 18px; }
  .prev li { margin: 2px 0; color: #595959; }
  .arrow { color: #1677ff; font-weight: 700; }
  .op { color: #8c8c8c; }
  .xref { color: #1677ff; text-decoration: none; border-bottom: 1px dashed #91caff; }
  .xref:hover { background: #e6f4ff; }
  .ref { font-weight: 600; font-variant-numeric: tabular-nums; }
  .cond { color: #722ed1; font-weight: 600; }
  .pill { border-radius: 10px; padding: 0 8px; font-size: 11px; font-weight: 600; }
  .pill.parallel { background: #f6ffed; color: #389e0d; border: 1px solid #b7eb8f; }
  .pill.cofire { background: #fff1f0; color: #cf1322; border: 1px solid #ffa39e; }
  .cofire-wrap { position: relative; display: inline-block; }
  .cofire-wrap .pill.cofire { cursor: help; }
  .cofire-tip { position: absolute; left: 0; bottom: 100%; z-index: 20; min-width: 180px; max-width: 300px;
    background: #1f1f1f; color: #fff; border-radius: 6px; padding: 8px 10px; font-size: 12px; font-weight: 400;
    box-shadow: 0 4px 16px rgba(0,0,0,0.28); opacity: 0; visibility: hidden; transition: opacity 0.12s; pointer-events: none; }
  /* Transparent bridge fills the gap above the pill so the pointer can reach the tip without dropping :hover. */
  .cofire-tip::after { content: ''; position: absolute; left: 0; right: 0; top: 100%; height: 6px; }
  .cofire-wrap:hover .cofire-tip { opacity: 1; visibility: visible; pointer-events: auto; }
  .cofire-tip-title { font-weight: 600; }
  .cofire-tip ul { margin: 4px 0 0; padding-left: 16px; }
  .cofire-tip li { margin: 2px 0; }
  .cofire-tip .xref { color: #91caff; border-bottom-color: #91caff; }
  .cofire-tip .cond { color: #d3adf7; }
  .cofire-tip .ref { color: #fff; }
  .flag { display: inline-block; width: 9px; height: 9px; border-radius: 9px; }
  .flag-label { font-size: 11px; color: #8c8c8c; }
  .children { margin-top: 6px; }
  .kids-toggle { cursor: pointer; margin: 6px 0 0; border: 1px solid #d9d9d9; background: #fafafa; color: #595959; border-radius: 4px; padding: 2px 10px; font-size: 12px; }
  .kids-toggle:hover { background: #f0f0f0; }
  .kids.kids-collapsed > .children { display: none; }
  @keyframes flash { 0% { background: #fffb8f; } 100% { background: transparent; } }
  .step.flash > .step-head { animation: flash 1.4s ease-out; border-radius: 4px; }
  .legend { margin-top: 40px; padding-top: 16px; border-top: 2px solid #f0f0f0; }
  .legend h2 { font-size: 15px; }
  .legend ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 6px; font-size: 13px; color: #595959; }
  @media print {
    body { background: #fff; }
    .no-print { display: none !important; }
    .layout { display: block; max-width: none; }
    .page { box-shadow: none; max-width: none; padding: 0; margin: 0; }
    .step.collapsed > .step-body, .phase-section.collapsed > .phase-body { display: block !important; }
    .kids.kids-collapsed > .children { display: block !important; }
    .kids-toggle { display: none !important; }
    .step.search-hidden { display: block !important; }
    .toggle, .toggle-spacer { display: none !important; }
    .step-body { break-inside: avoid; }
  }
`;

const SCRIPT = `
  (function () {
    function expandAncestors(el) {
      var node = el;
      while (node) {
        if (node.classList) node.classList.remove('collapsed');
        node = node.parentElement;
      }
    }
    document.querySelectorAll('.toggle').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var step = btn.closest('.step');
        if (step) step.classList.toggle('collapsed');
      });
    });
    document.querySelectorAll('.phase-head').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var sec = btn.closest('.phase-section');
        if (sec) sec.classList.toggle('collapsed');
      });
    });
    document.querySelectorAll('.kids-toggle').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var kids = btn.closest('.kids');
        if (!kids) return;
        var collapsed = kids.classList.toggle('kids-collapsed');
        btn.textContent = collapsed ? 'Expand sub-steps' : 'Collapse sub-steps';
      });
    });
    var expandBtn = document.getElementById('expandAll');
    if (expandBtn) expandBtn.addEventListener('click', function () {
      document.querySelectorAll('.step, .phase-section').forEach(function (el) { el.classList.remove('collapsed'); });
    });
    var collapseBtn = document.getElementById('collapseAll');
    if (collapseBtn) collapseBtn.addEventListener('click', function () {
      document.querySelectorAll('.step, .phase-section').forEach(function (el) { el.classList.add('collapsed'); });
    });
    var printBtn = document.getElementById('printBtn');
    if (printBtn) printBtn.addEventListener('click', function () { window.print(); });
    var tocToggle = document.getElementById('tocToggle');
    if (tocToggle) tocToggle.addEventListener('click', function () { document.body.classList.toggle('toc-hidden'); });
    var displayBtn = document.getElementById('displayBtn');
    var displayMenu = document.getElementById('displayMenu');
    if (displayBtn && displayMenu) {
      displayBtn.addEventListener('click', function (e) { e.stopPropagation(); displayMenu.hidden = !displayMenu.hidden; });
      document.addEventListener('click', function () { displayMenu.hidden = true; });
      displayMenu.addEventListener('click', function (e) { e.stopPropagation(); });
    }
    document.querySelectorAll('.tgl').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var cls = btn.getAttribute('data-cls');
        btn.classList.toggle('off');
        document.body.classList.toggle(cls);
      });
    });
    var searchBox = document.getElementById('searchBox');
    if (searchBox) searchBox.addEventListener('input', function () {
      var q = searchBox.value.trim().toLowerCase();
      var steps = document.querySelectorAll('.step');
      if (!q) { steps.forEach(function (s) { s.classList.remove('search-hidden'); }); return; }
      steps.forEach(function (s) { s.classList.add('search-hidden'); });
      steps.forEach(function (s) {
        var text = s.getAttribute('data-text') || '';
        if (text.indexOf(q) >= 0) {
          var n = s;
          while (n) {
            if (n.classList && n.classList.contains('step')) { n.classList.remove('search-hidden'); n.classList.remove('collapsed'); }
            n = n.parentElement;
          }
        }
      });
    });
    document.querySelectorAll('a.xref').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        var id = a.getAttribute('href').slice(1);
        var target = document.getElementById(id);
        if (!target) return;
        expandAncestors(target);
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.classList.remove('flash');
        void target.offsetWidth;
        target.classList.add('flash');
      });
    });
  })();
`;

export function buildWorkflowHtml(
  workflow: Workflow,
  tree: WorkflowStep[],
  phases: WorkflowPhase[],
  options: DocExportOptions,
): string {
  const sections = buildSections(tree, phases, options.groupByPhase);
  const numbers = numberSteps(sections);
  const ctx = buildContext(tree, numbers);
  const body = sections
    .map((section) => {
      const steps = section.roots
        .slice()
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((s) => renderStep(s, ctx, options, 0))
        .join('');
      if (section.title == null) return steps;
      const border = section.color ? `border-left-color:${section.color}` : '';
      return `<div class="phase-section"><button type="button" class="phase-head" style="${border}"><span class="tw">&#9662;</span><span>${escapeHtml(section.title)}</span></button><div class="phase-body">${steps}</div></div>`;
    })
    .join('');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(workflow.name)}</title>
<style>${STYLES}</style>
</head>
<body class="hide-roles hide-previous hide-reviews">
${renderToolbar(workflow)}
<div class="layout">
${renderToc(sections, ctx)}
<div class="page">
${renderHeader(workflow)}
${body}
${renderLegend(options)}
</div>
</div>
<script>${SCRIPT}</script>
</body>
</html>`;
}
