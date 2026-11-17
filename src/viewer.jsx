// Material viewer: shows a PDF, Word or PowerPoint file and what KNOXIA could read from it.
// Loaded on demand (React.lazy) so pdf.js and friends do not slow down the rest of the app.
import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, ChevronLeft, ChevronRight, Copy, FileText, Minus, Plus } from 'lucide-react';
import { extractMaterial } from './extract.js';
import { toast } from './materials.jsx';

function PdfView({ doc }) {
  const [page, setPage] = useState(1); const [zoom, setZoom] = useState('fit'); const [busy, setBusy] = useState(true);
  const [err, setErr] = useState(''); const [width, setWidth] = useState(0);
  const wrap = useRef(null); const canvas = useRef(null);
  useEffect(() => {
    const el = wrap.current; if (!el) return undefined;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth)); ro.observe(el); setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    let live = true; let task = null;
    (async () => {
      try {
        setBusy(true); setErr('');
        const p = await doc.getPage(page); const base = p.getViewport({ scale: 1 });
        const scale = zoom === 'fit' ? Math.max(0.3, (width - 2) / base.width) : zoom;
        const dpr = Math.min(window.devicePixelRatio || 1, 2); const vp = p.getViewport({ scale }); const c = canvas.current;
        if (!c || !live || !width) return;
        c.width = Math.floor(vp.width * dpr); c.height = Math.floor(vp.height * dpr);
        c.style.width = `${Math.floor(vp.width)}px`; c.style.height = `${Math.floor(vp.height)}px`;
        task = p.render({ canvas: c, viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined });
        await task.promise; if (live) setBusy(false);
      } catch (e) {
        if (e && e.name === 'RenderingCancelledException') return;
        if (live) { setErr('This page could not be displayed.'); setBusy(false); }
      }
    })();
    return () => { live = false; if (task) task.cancel(); };
  }, [doc, page, zoom, width]);
  const total = doc.numPages; const go = (n) => setPage(Math.min(total, Math.max(1, n)));
  const step = (d) => setZoom((z) => Math.min(3, Math.max(0.5, (z === 'fit' ? 1 : z) + d)));
  const key = (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); go(page + 1); }
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(page - 1); }
  };
  return <div className="pdf-view">
    <div className="pdf-bar" role="toolbar" aria-label="PDF controls">
      <button type="button" className="icon-btn" aria-label="Previous page" disabled={page <= 1} onClick={() => go(page - 1)}><ChevronLeft size={18} /></button>
      <label className="pdf-page">Page <input type="number" min="1" max={total} value={page} onChange={(e) => go(parseInt(e.target.value, 10) || 1)} aria-label="Page number" /> of {total}</label>
      <button type="button" className="icon-btn" aria-label="Next page" disabled={page >= total} onClick={() => go(page + 1)}><ChevronRight size={18} /></button>
      <span className="pdf-gap" />
      <button type="button" className="icon-btn" aria-label="Zoom out" onClick={() => step(-0.25)}><Minus size={18} /></button>
      <button type="button" className="chip" aria-pressed={zoom === 'fit'} onClick={() => setZoom('fit')}>Fit width</button>
      <button type="button" className="icon-btn" aria-label="Zoom in" onClick={() => step(0.25)}><Plus size={18} /></button>
    </div>
    <div className="pdf-stage" ref={wrap} tabIndex={0} onKeyDown={key} aria-label="Document page. Use the arrow keys to change page.">
      {err ? <div className="notice error" role="alert"><AlertCircle size={16} />{err}</div> : <canvas ref={canvas} className={busy ? 'busy' : ''} />}
    </div>
  </div>;
}

function Slides({ slides }) {
  if (!slides.length) return <div className="empty-state"><FileText size={32} /><b>No slides found</b></div>;
  return <>
    <p className="muted">Slide text only. Pictures, charts and layout are not shown.</p>
    <div className="slide-grid">{slides.map((s) => <section className="slide-card" key={s.n} aria-label={`Slide ${s.n}`}>
      <span className="slide-no">Slide {s.n}</span><h4>{s.title || 'Untitled slide'}</h4>
      {s.lines.length > 0 && <ul>{s.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>}</section>)}</div></>;
}

export default function MaterialViewer({ file, kind, onInfo }) {
  const [data, setData] = useState(null); const [err, setErr] = useState(''); const [tab, setTab] = useState('preview'); const [full, setFull] = useState(false);
  useEffect(() => {
    let live = true; let doc = null; setData(null); setErr(''); setTab('preview'); setFull(false);
    extractMaterial(file, kind).then((d) => {
      if (!live) { if (d.pdfDoc) d.pdfDoc.destroy(); return; }
      doc = d.pdfDoc || null; setData(d);
      if (onInfo) onInfo({ pages: d.pages, slides: d.slides ? d.slides.length : undefined, words: d.words, minutes: d.minutes, title: d.meta && d.meta.title, author: d.meta && d.meta.author });
    }).catch(() => { if (live) setErr("We couldn't read this file. It may be damaged or password protected."); });
    return () => { live = false; if (doc && doc.destroy) doc.destroy(); };
  }, [file, kind]); // eslint-disable-line react-hooks/exhaustive-deps
  if (err) return <div className="empty-state"><AlertCircle size={32} /><b>Preview unavailable</b><p>{err}</p></div>;
  if (!data) return <div className="viewer-loading" role="status"><i className="spin" aria-hidden="true" /> Reading your file…</div>;
  const stats = [data.pages && ['Pages', data.pages], data.slides && ['Slides', data.slides.length], ['Words', data.words.toLocaleString()], data.minutes && ['Reading time', `${data.minutes} min`]].filter(Boolean);
  const shown = full ? data.text : data.text.slice(0, 4000);
  const copy = () => navigator.clipboard.writeText(data.text).then(() => toast('Text copied'), () => toast('Could not copy the text'));
  return <div className="viewer">
    <dl className="viewer-stats">{stats.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
    {data.scanned && <div className="notice"><AlertCircle size={16} />No selectable text was found. This looks like a scanned or image-only file, so KNOXIA cannot study from it yet.</div>}
    <div className="viewer-tabs" role="tablist" aria-label="Viewer">
      {[['preview', 'Preview'], ['text', 'Extracted text']].map(([id, label]) => <button key={id} type="button" role="tab" id={`vt-${id}`} aria-selected={tab === id} aria-controls={`vp-${id}`} onClick={() => setTab(id)}>{label}</button>)}
    </div>
    <div role="tabpanel" id="vp-preview" aria-labelledby="vt-preview" hidden={tab !== 'preview'}>
      {data.pdfDoc && <PdfView doc={data.pdfDoc} />}
      {data.html != null && (data.html ? <article className="doc-html" dangerouslySetInnerHTML={{ __html: data.html }} /> : <div className="empty-state"><FileText size={32} /><b>This document is empty</b></div>)}
      {data.slides && <Slides slides={data.slides} />}
    </div>
    <div role="tabpanel" id="vp-text" aria-labelledby="vt-text" hidden={tab !== 'text'}>
      {data.text ? <>
        <div className="text-actions"><button type="button" className="btn outline" onClick={copy}><Copy size={16} /><span>Copy text</span></button></div>
        <div className="text-block">{shown}{!full && data.text.length > 4000 && '…'}</div>
        {data.text.length > 4000 && <button type="button" className="link-btn" onClick={() => setFull((f) => !f)}>{full ? 'Show less' : 'Show all text'}</button>}
        {data.truncated && <p className="muted">Very large file: only the first part was read.</p>}
      </> : <div className="empty-state"><FileText size={32} /><b>No text found</b></div>}
    </div>
  </div>;
}
