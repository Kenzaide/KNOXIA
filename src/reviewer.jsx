import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, BookOpen, Check, FolderOpen, RotateCcw, Save, Sparkles, Type, X } from 'lucide-react';
import { Button, SectionTitle } from './ui.jsx';
import { useMaterials, toast } from './materials.jsx';
import { getFile } from './files.js';
import { saveReviewer, logEvent } from './data.js';
import { SavedReviewers } from './pages.jsx';
import { generateReviewer, reviewerToText, STYLES, MIN_WORDS, MAX_CHARS } from './reviewerGen.js';
import { SAMPLE_TEXT } from './samples.js';

/**
 * Create AI Reviewer (Patch 9, demo).
 *
 * FRONTEND-ONLY DEMO: the "AI" is the rule-based generator in reviewerGen.js, and the progress steps
 * below are a simulated workflow. The file is really read in the browser, but nothing is sent anywhere.
 * To use a real model, replace the `generateReviewer(...)` call in `generate` and keep the result shape.
 */
const STEPS = ['Reading your material', 'Finding the key ideas', 'Pulling out terms and definitions', 'Building your reviewer'];
const STEP_MS = 550;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const wordCount = (t) => (String(t).match(/\S+/g) || []).length;
const STYLE_HINT = { 'Quick summary': 'Key ideas at a glance', 'Detailed reviewer': 'Comprehensive notes and examples', 'Exam cram': 'Important points before exams', 'Topic-by-topic': 'Organized by lesson topic' };

/** Returns the text of a library material: from its stored file, or the built-in sample text. */
async function readMaterial(m) {
  const blob = await getFile(m.id);
  if (blob) {
    let d;
    try { d = await (await import('./extract.js')).extractMaterial(blob, m.type); }
    catch { throw new Error("We couldn't read this file. It may be damaged or password protected."); }
    if (d.pdfDoc && d.pdfDoc.destroy) d.pdfDoc.destroy();
    if (d.scanned || !d.text) throw new Error('No selectable text was found. This looks like a scanned or image-only file, so the demo cannot build a reviewer from it yet.');
    return { text: d.text, note: d.truncated ? 'This is a very large file, so only the first part was read.' : '' };
  }
  if (SAMPLE_TEXT[m.id]) return { text: SAMPLE_TEXT[m.id], note: 'This sample material has no stored file, so built-in sample text was used.' };
  throw new Error('This sample material has no file to read. Upload a file or paste text instead.');
}

function Steps({ step }) {
  const pct = Math.round((step / STEPS.length) * 100);
  return <div className="rv-running" style={{ width: '100%' }}>
    <h3>Building your reviewer</h3>
    <ol className="rv-steps" aria-live="polite">{STEPS.map((label, i) => <li key={label} className={i < step ? 'done' : i === step ? 'active' : ''}>
      <span className="rv-dot" aria-hidden="true">{i < step ? <Check size={13} /> : i === step ? <i className="spin" /> : null}</span>
      <span>{label}{i === step ? '\u2026' : ''}<span className="sr-only">{i < step ? ' (done)' : i === step ? ' (in progress)' : ''}</span></span></li>)}</ol>
    <div className="progress-track" role="progressbar" aria-label="Reviewer progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><span style={{ width: `${pct}%` }} /></div>
  </div>;
}

function Section({ sec }) {
  const body = sec.kind === 'text' ? sec.items.map((t, i) => <p key={i}>{t}</p>)
    : sec.kind === 'bullets' ? <ul>{sec.items.map((t, i) => <li key={i}>{t}</li>)}</ul>
    : sec.kind === 'chips' ? <div className="rv-chips">{sec.items.map((t) => <span key={t}>{t}</span>)}</div>
    : sec.kind === 'defs' ? <dl className="rv-defs">{sec.items.map((d) => <React.Fragment key={d.term}><dt>{d.term}</dt><dd>{d.meaning}</dd></React.Fragment>)}</dl>
    : <ol className="rv-qa">{sec.items.map((p, i) => <li key={i}><b>{p.q}</b><span>{p.a}</span></li>)}</ol>;
  return <section className="rv-sec"><h4>{sec.heading}</h4>{body}</section>;
}

function Result({ result }) {
  const { stats } = result;
  const facts = [`${stats.words.toLocaleString()} words read`, stats.points && `${stats.points} key points`, stats.definitions && `${stats.definitions} definitions`, stats.questions && `${stats.questions} questions`].filter(Boolean);
  return <div className="rv-result">
    <div className="rv-head"><span className="rv-demo"><Sparkles size={13} /> Demo reviewer</span><span className="rv-facts">{facts.join(' \u00b7 ')}</span></div>
    {result.note && <div className="notice"><AlertCircle size={16} />{result.note}</div>}
    {result.truncated && <div className="notice"><AlertCircle size={16} />Only the first {MAX_CHARS.toLocaleString()} characters were used.</div>}
    {result.focus.length > 0 && <p className="muted">Extra focus: {result.focus.join(', ')}</p>}
    {result.sections.map((sec) => <Section key={sec.id} sec={sec} />)}
  </div>;
}

export default function CreateReviewer() {
  const nav = useNavigate(); const [params] = useSearchParams(); const { items } = useMaterials();
  const preset = params.get('material');
  const [mode, setMode] = useState('material');
  const [materialId, setMaterialId] = useState(preset || '');
  const material = items.find((m) => m.id === materialId) || items[0] || null;
  const [text, setText] = useState('');
  const [style, setStyle] = useState('Detailed reviewer');
  const [instructions, setInstructions] = useState('');
  const [title, setTitle] = useState('');
  const [stored, setStored] = useState(undefined); // does the selected material have a real file in this browser?
  const [phase, setPhase] = useState('idle');       // idle | running | done | error
  const [step, setStep] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const run = useRef(0); const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; run.current++; }; }, []);

  const materialKey = material ? material.id : '';
  useEffect(() => {
    let on = true; setStored(undefined);
    if (materialKey) getFile(materialKey).then((b) => { if (on) setStored(!!b); });
    return () => { on = false; };
  }, [materialKey]);

  const words = useMemo(() => wordCount(text), [text]);
  const sig = JSON.stringify([mode, mode === 'material' ? materialKey : text, style, instructions.trim()]);
  const stale = phase === 'done' && result && result.sig !== sig;
  const shownTitle = title || (mode === 'material' && material ? `${material.name} reviewer` : 'My study reviewer');
  const sourceReady = mode === 'text' ? text.trim().length > 0 : !!material && (stored === true || (stored === false && !!SAMPLE_TEXT[material.id]));
  const materialNote = !material ? 'You have no materials yet. Upload one, or paste text instead.'
    : stored === undefined ? 'Checking this material\u2026'
    : stored ? 'KNOXIA will read the file stored in this browser.'
    : SAMPLE_TEXT[material.id] ? 'Sample material: the demo will use built-in sample text.'
    : material.fileName ? 'The original file is no longer stored in this browser. Upload it again or paste text instead.'
    : 'This sample material has no file to read. Upload a file or paste text instead.';

  const generate = async () => {
    if (phase === 'running') return;
    const token = ++run.current; const alive = () => live.current && run.current === token;
    setPhase('running'); setStep(0); setError(''); setResult(null);
    try {
      const src = mode === 'text' ? { text, note: '' } : await readMaterial(material);
      if (!alive()) return;
      await sleep(STEP_MS); if (!alive()) return; setStep(1);
      const out = generateReviewer({ text: src.text, style, instructions });
      await sleep(STEP_MS); if (!alive()) return; setStep(2);
      await sleep(STEP_MS); if (!alive()) return; setStep(3);
      await sleep(STEP_MS); if (!alive()) return;
      setResult({ ...out, sig, note: src.note, file: mode === 'text' ? 'Pasted text' : material.name, source: mode, materialId: mode === 'material' ? material.id : null });
      setPhase('done');
    } catch (e) {
      if (alive()) { setError(e && e.message ? e.message : 'Something went wrong while building the reviewer. Please try again.'); setPhase('error'); }
    }
  };
  const cancel = () => { run.current++; setPhase('idle'); setStep(0); };
  const save = () => {
    if (!result || stale) return;
    const name = title.trim() || shownTitle;
    const id = saveReviewer({
      title: name.slice(0, 120), file: result.file, style: result.style, body: reviewerToText(result, { file: result.file, style: result.style }),
      generated: { demo: true, at: new Date().toISOString(), source: result.source, materialId: result.materialId, focus: result.focus, stats: result.stats },
    });
    logEvent(`Reviewer created: ${name.slice(0, 80)}`); toast('Reviewer saved'); nav('/reviewers/' + id, { viewTransition: true });
  };

  return <><SectionTitle title="Create AI Reviewer" subtitle="Turn your learning materials into a reviewer that works for you." />
    <div className="builder-layout">
      <div className="panel builder-form">
        <label className="field-label" htmlFor="rv-title">Reviewer title</label>
        <input id="rv-title" className="field" maxLength={120} value={title} placeholder={shownTitle} onChange={(e) => setTitle(e.target.value)} />

        <span className="field-label" id="rv-source-label">Source</span>
        <div className="segmented" role="group" aria-labelledby="rv-source-label">
          <button type="button" className={mode === 'material' ? 'selected' : ''} aria-pressed={mode === 'material'} onClick={() => setMode('material')}><FolderOpen size={15} /> My materials</button>
          <button type="button" className={mode === 'text' ? 'selected' : ''} aria-pressed={mode === 'text'} onClick={() => setMode('text')}><Type size={15} /> Paste text</button>
        </div>
        {mode === 'material' ? <>
          <select className="field" aria-label="Source material" value={material ? material.id : ''} disabled={!items.length} onChange={(e) => setMaterialId(e.target.value)}>
            {items.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.type})</option>)}
          </select>
          <p className="rv-hint" role="status">{materialNote}</p>
        </> : <>
          <textarea className="field textarea rv-paste" aria-label="Text to build a reviewer from" maxLength={MAX_CHARS} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Paste or type your lecture notes here\u2026'} />
          <div className="rv-count"><span className={words > 0 && words < MIN_WORDS ? 'warn' : ''}>{words.toLocaleString()} words{words < MIN_WORDS ? ` \u00b7 at least ${MIN_WORDS} needed` : ''}</span>
            <button type="button" className="link-btn" onClick={() => setText(SAMPLE_TEXT['1'])}>Try sample notes</button></div>
        </>}

        <span className="field-label">Reviewer format</span>
        <div className="choice-grid">{STYLES.map((x) => <button type="button" className={`choice ${style === x ? 'chosen' : ''}`} aria-pressed={style === x} onClick={() => setStyle(x)} key={x}><BookOpen size={18} /><b>{x}</b><small>{STYLE_HINT[x]}</small></button>)}</div>

        <label className="field-label" htmlFor="rv-extra">Additional instructions <span>Optional</span></label>
        <textarea id="rv-extra" className="field textarea" maxLength={300} placeholder="e.g. Focus on definitions and real-world examples..." value={instructions} onChange={(e) => setInstructions(e.target.value)} />
        <div className="rv-actions">
          <Button icon={Sparkles} loading={phase === 'running'} onClick={generate} type="button">{phase === 'running' ? 'Generating\u2026' : 'Generate reviewer'}</Button>
          {phase === 'running' && <Button variant="outline" icon={X} onClick={cancel}>Cancel</Button>}
          {!sourceReady && phase !== 'running' && <small className="rv-hint">{mode === 'text' ? 'Add some text to continue.' : 'Choose a material that can be read.'}</small>}
        </div>
      </div>

      <div className="panel preview-panel" aria-busy={phase === 'running'}>
        <p className="sr-only" role="status">{phase === 'done' && !stale ? 'Your reviewer is ready.' : ''}</p>
        {phase === 'running' ? <Steps step={step} /> : phase === 'error' ? <><div className="preview-icon"><AlertCircle size={20} /></div><h3>We couldn't build a reviewer</h3>
          <div className="notice error" role="alert"><AlertCircle size={16} />{error}</div>
          <div className="rv-actions"><Button variant="outline" icon={RotateCcw} onClick={generate}>Try again</Button></div></>
        : phase === 'done' && result ? <>
          <Result result={result} />
          {stale && <div className="notice" role="status"><AlertCircle size={16} />You changed the settings. Regenerate to update this preview.</div>}
          <div className="rv-actions">
            {!stale && <Button icon={Save} onClick={save}>Save reviewer</Button>}
            <Button variant="outline" icon={RotateCcw} onClick={generate}>Regenerate</Button>
          </div></>
        : <><div className="preview-icon"><Sparkles size={20} /></div><h3>Your reviewer preview</h3>
          <p>Your generated reviewer will appear here, organized into clear sections with key terms, definitions, examples and review questions.</p>
          <div className="preview-lines"><i /><i /><i /><i /><i /></div>
          <div className="preview-badges"><span>Key concepts</span><span>Definitions</span><span>Examples</span></div>
          <p className="rv-hint">Demo mode: this runs on your device with simple text rules. No AI service is connected yet.</p></>}
      </div>
    </div>
    <SavedReviewers /></>;
}
