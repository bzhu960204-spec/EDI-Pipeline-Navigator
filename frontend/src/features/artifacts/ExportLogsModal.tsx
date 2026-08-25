import { useRef, useState } from 'react';
import { App as AntApp, Button, Checkbox, Modal } from 'antd';
import { ArrowLeftOutlined, HolderOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { LogEntry } from '../../api/logs';

interface Props {
  open: boolean;
  onClose: () => void;
  items: LogEntry[];
  /** Header shown on the cover page of the exported HTML (e.g. artifact name). */
  documentTitle: string;
}

/**
 * Two-step export flow (select -> order) that produces a single self-contained
 * .html file. Log content is stored as plain text, so it is escaped and rendered
 * as paragraphs. The exported HTML ships its own inline <style>.
 */
export function ExportLogsModal({ open, onClose, items, documentTitle }: Props) {
  const { message } = AntApp.useApp();
  const [step, setStep] = useState<'select' | 'order'>('select');
  const [selected, setSelected] = useState<LogEntry[]>([]);
  const [ordered, setOrdered] = useState<LogEntry[]>([]);
  const [exporting, setExporting] = useState(false);

  function reset() {
    setStep('select');
    setSelected([]);
    setOrdered([]);
    setExporting(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function toggleSelect(item: LogEntry) {
    setSelected((prev) =>
      prev.find((n) => n.id === item.id) ? prev.filter((n) => n.id !== item.id) : [...prev, item],
    );
  }

  function selectAll() {
    setSelected(selected.length === items.length ? [] : [...items]);
  }

  function goToOrder() {
    const byId = new Map(selected.map((s) => [s.id, s]));
    setOrdered(items.filter((i) => byId.has(i.id)));
    setStep('order');
  }

  // ── Drag-to-reorder ──────────────────────────────────────────────────────
  const dragFrom = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  function onDragStart(e: React.DragEvent, index: number) {
    dragFrom.current = index;
    e.dataTransfer.effectAllowed = 'move';
  }
  function onDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(index);
  }
  function onDrop(e: React.DragEvent, index: number) {
    e.preventDefault();
    if (dragFrom.current === null || dragFrom.current === index) {
      dragFrom.current = null;
      setDragOver(null);
      return;
    }
    setOrdered((prev) => {
      const arr = [...prev];
      const [moved] = arr.splice(dragFrom.current!, 1);
      arr.splice(index, 0, moved);
      return arr;
    });
    dragFrom.current = null;
    setDragOver(null);
  }

  function buildHtml(): string {
    type TocEntry = { id: string; text: string };
    const toc: TocEntry[] = [];

    const sections = ordered
      .map((item, i) => {
        const pageBreak = i > 0 ? 'page-break-before: always;' : '';
        const sectionId = `doc-${i + 1}`;
        const content = renderPlainText(item.content);
        toc.push({ id: sectionId, text: item.title });
        return `<section id="${sectionId}" style="${pageBreak} margin-bottom: 28pt;">
  <h2 class="doc-section-title">${escapeHtml(item.title)}</h2>
  <p class="doc-section-meta">${formatDate(item.updatedAt)}</p>
  <div class="doc-rendered">${content}</div>
</section>`;
      })
      .join('\n');

    const hasToc = toc.length > 1;
    const tocHtml = hasToc
      ? `<input type="checkbox" id="toc-toggle" class="toc-toggle" hidden />
<label for="toc-toggle" class="toc-fab" title="Contents" aria-label="Open contents">
  <span class="toc-fab-icon">☰</span>
</label>
<label for="toc-toggle" class="toc-backdrop"></label>
<aside class="toc-drawer" aria-label="Table of contents">
  <div class="toc-drawer-head">
    <span class="toc-title">Contents</span>
    <label for="toc-toggle" class="toc-close" title="Close" aria-label="Close contents">×</label>
  </div>
  <nav class="toc">
    <ul>
${toc.map((t) => `      <li class="toc-l0"><div class="toc-row"><span class="toc-caret toc-caret-empty"></span><a href="#${t.id}">${escapeHtml(t.text)}</a></div></li>`).join('\n')}
    </ul>
  </nav>
</aside>`
      : '';

    const tocScript = hasToc
      ? `
<script>
  (function () {
    var toggle = document.getElementById('toc-toggle');
    if (!toggle) return;
    document.querySelectorAll('.toc a').forEach(function (a) {
      a.addEventListener('click', function () { toggle.checked = false; });
    });
  })();
<\/script>`
      : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(documentTitle)} — Logs</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  html { scroll-behavior: smooth; }
  body {
    font-family: 'Inter', 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif;
    font-size: 11pt;
    color: #1f2328;
    background: #eceef1;
    line-height: 1.75;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }
  .sheet {
    max-width: 760px;
    margin: 40px auto 72px;
    padding: 48px 56px;
    background: #fff;
    border-radius: 12px;
    box-shadow: 0 1px 2px rgba(16, 24, 40, 0.08), 0 12px 32px rgba(16, 24, 40, 0.08);
  }
  .cover {
    margin-bottom: 24pt;
    padding-bottom: 12pt;
    border-bottom: 2px solid #333;
  }
  .cover h1 { font-size: 18pt; margin: 0 0 4pt; font-weight: 700; letter-spacing: -0.01em; }
  .cover p { font-size: 9pt; color: #666; margin: 0; }
  .toc-toggle { position: absolute; width: 0; height: 0; opacity: 0; pointer-events: none; }
  .toc-fab {
    position: fixed; top: 20px; left: 20px; z-index: 50;
    width: 46px; height: 46px; border-radius: 12px;
    display: flex; align-items: center; justify-content: center;
    background: #1f2328; color: #fff; cursor: pointer;
    box-shadow: 0 6px 18px rgba(16, 24, 40, 0.22);
    transition: opacity .2s ease, transform .2s ease, background .2s ease;
  }
  .toc-fab:hover { transform: translateY(-1px); background: #2d333b; }
  .toc-fab-icon { font-size: 19px; line-height: 1; }
  .toc-backdrop {
    position: fixed; inset: 0; z-index: 60;
    background: rgba(16, 24, 40, 0.38);
    opacity: 0; visibility: hidden;
    transition: opacity .25s ease, visibility .25s ease;
    cursor: pointer;
  }
  .toc-drawer {
    position: fixed; top: 0; left: 0; bottom: 0; z-index: 70;
    width: 308px; max-width: 84vw;
    display: flex; flex-direction: column;
    background: #fff;
    border-right: 1px solid #e2e6ea;
    box-shadow: 0 0 48px rgba(16, 24, 40, 0.20);
    transform: translateX(-100%);
    transition: transform .28s cubic-bezier(.4, 0, .2, 1);
  }
  .toc-drawer-head {
    flex: 0 0 auto;
    display: flex; align-items: center; justify-content: space-between;
    padding: 18px 20px; border-bottom: 1px solid #eef0f2;
  }
  .toc-close {
    width: 30px; height: 30px; border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    font-size: 22px; line-height: 1; color: #6b7280; cursor: pointer;
    transition: background .15s ease, color .15s ease;
  }
  .toc-close:hover { background: #f1f3f5; color: #1f2328; }
  .toc-toggle:checked ~ .toc-drawer { transform: translateX(0); }
  .toc-toggle:checked ~ .toc-backdrop { opacity: 1; visibility: visible; }
  .toc-toggle:checked ~ .toc-fab { opacity: 0; pointer-events: none; transform: scale(.9); }
  .toc { flex: 1 1 auto; overflow-y: auto; padding: 14px 12px 28px; }
  .toc-title { font-size: 12pt; font-weight: 700; margin: 0; color: #1f2328; }
  .toc ul { list-style: none; margin: 0; padding: 0; }
  .toc li { margin: 1px 0; line-height: 1.5; }
  .toc-row { display: flex; align-items: flex-start; }
  .toc-caret { flex: 0 0 auto; width: 18px; height: 26px; }
  .toc-caret-empty::before { display: none; }
  .toc a {
    flex: 1 1 auto; display: block; padding: 3px 8px; border-radius: 6px;
    color: #1d4ed8; text-decoration: none; font-size: 10.5pt;
    transition: background .15s ease; word-break: break-word;
  }
  .toc a:hover { background: #f1f5ff; text-decoration: none; }
  .toc-l0 > .toc-row > a { font-weight: 700; }
  .doc-section-title {
    font-size: 14pt;
    font-weight: 700;
    border-left: 4px solid #333;
    padding: 0 0 0 8pt;
    margin: 0 0 6pt;
    letter-spacing: -0.01em;
  }
  .doc-section-meta { color: #888; font-size: 9pt; margin: 0 0 12pt; }
  .doc-rendered { font-size: 10.5pt; line-height: 1.8; color: #2a2f36; }
  .doc-rendered > :first-child { margin-top: 0; }
  .doc-rendered p { margin: 0 0 0.75em; white-space: pre-wrap; }
  .doc-rendered .doc-empty { color: #999; font-style: italic; }
  @media screen {
    body { font-size: 11.5pt; }
    .doc-rendered { font-size: 11.5pt; }
    section + section { margin-top: 8pt; }
  }
  @media print {
    body { background: #fff; }
    .toc-toggle, .toc-fab, .toc-backdrop, .toc-drawer { display: none !important; }
    .sheet {
      max-width: none;
      margin: 0;
      padding: 0;
      background: transparent;
      border-radius: 0;
      box-shadow: none;
    }
  }
</style>
</head>
<body>
${tocHtml}
<main class="sheet">
<div class="cover">
  <h1>${escapeHtml(documentTitle)}</h1>
  <p>Exported ${new Date().toLocaleString()} · ${ordered.length} log${ordered.length === 1 ? '' : 's'}</p>
</div>
${sections}
</main>${tocScript}
</body>
</html>`;
  }

  function handleExportHtml() {
    setExporting(true);
    try {
      const html = buildHtml();
      const stamp = dayjs().format('YYYY-MM-DD');
      const safeTitle = (documentTitle || 'Logs').replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 80);
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeTitle} - Logs - ${stamp}.html`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      handleClose();
    } catch (err) {
      console.error('HTML export failed:', err);
      message.error('Failed to export HTML.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <Modal
      open={open}
      onCancel={handleClose}
      title={step === 'select' ? 'Export logs' : 'Order logs'}
      destroyOnClose
      footer={
        step === 'select' ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ fontSize: 12, color: '#8c8c8c' }}>{selected.length} selected</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button onClick={handleClose}>Cancel</Button>
              <Button type="primary" onClick={goToOrder} disabled={selected.length === 0}>
                Next
              </Button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
            <Button icon={<ArrowLeftOutlined />} onClick={() => setStep('select')}>
              Back
            </Button>
            <Button type="primary" loading={exporting} onClick={handleExportHtml}>
              Export HTML
            </Button>
          </div>
        )
      }
    >
      {step === 'select' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.length === 0 ? (
            <p style={{ color: '#8c8c8c', fontStyle: 'italic' }}>No logs available to export.</p>
          ) : (
            <>
              <Checkbox
                checked={selected.length === items.length}
                indeterminate={selected.length > 0 && selected.length < items.length}
                onChange={selectAll}
              >
                Select all ({items.length})
              </Checkbox>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: '50vh', overflowY: 'auto' }}>
                {items.map((item) => (
                  <label
                    key={item.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      border: '1px solid #f0f0f0',
                      borderRadius: 6,
                      padding: '8px 12px',
                      cursor: 'pointer',
                    }}
                  >
                    <Checkbox
                      checked={!!selected.find((s) => s.id === item.id)}
                      onChange={() => toggleSelect(item)}
                    />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.title}
                      </div>
                      <div style={{ fontSize: 12, color: '#8c8c8c' }}>
                        {dayjs(item.updatedAt).format('MMM D, YYYY HH:mm')}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {step === 'order' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ fontSize: 12, color: '#8c8c8c', margin: 0 }}>
            Drag to reorder. Each log starts on a new page.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {ordered.map((item, i) => (
              <div
                key={item.id}
                draggable
                onDragStart={(e) => onDragStart(e, i)}
                onDragOver={(e) => onDragOver(e, i)}
                onDrop={(e) => onDrop(e, i)}
                onDragEnd={() => setDragOver(null)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  border: dragOver === i ? '1px solid #1677ff' : '1px solid #f0f0f0',
                  background: dragOver === i ? 'rgba(22,119,255,0.05)' : undefined,
                  borderRadius: 6,
                  padding: '8px 12px',
                }}
              >
                <HolderOutlined style={{ cursor: 'grab', color: '#8c8c8c' }} />
                <span style={{ width: 20, flex: '0 0 auto', fontSize: 12, color: '#8c8c8c' }}>{i + 1}.</span>
                <span style={{ minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.title}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}

// ── helpers ────────────────────────────────────────────────────────────────
function formatDate(iso: string) {
  return dayjs(iso).format('MMM D, YYYY HH:mm');
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Plain-text content -> HTML paragraphs (blank line splits paragraphs; single
// newlines are preserved via CSS white-space: pre-wrap).
function renderPlainText(text: string): string {
  if (!text || !text.trim()) {
    return '<p class="doc-empty">No content</p>';
  }
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((para) => `<p>${escapeHtml(para)}</p>`)
    .join('\n');
}
