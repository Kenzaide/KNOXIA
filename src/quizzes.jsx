import React, { useEffect, useId, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertCircle, ArrowUpRight, BookOpen, BrainCircuit, Check, CheckCircle2, History as HistoryIcon, Pencil, Play, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { Button, SectionTitle, ConfirmDialog } from './ui.jsx';
import { toast } from './materials.jsx';
import { useProfile } from './accounts.js';
import { BANK, useReviewers, logEvent } from './data.js';
import { updatedAt } from './reviewerLib.js';
import { QuizRunner } from './quizRunner.jsx';
import { RecentAttempts, saveAttempt } from './quizResults.jsx';
import {
  COUNTS, MAX_OPTIONS, MAX_Q, MAX_QUESTIONS, MAX_QUIZZES, MAX_TITLE, MAX_EXPLANATION, MIN_OPTIONS, SAMPLE_MAX, TF, TYPE_LABELS,
  cleanQuizTitle, generateFromReviewer, makeQuiz, sampleQuestions, sourceLabel, toTuple, useQuizLibrary,
} from './quizzes.js';

/**
 * Quiz generation, demo (Patch 12). Three ways to get a quiz:
 *   From a reviewer  the demo generator builds questions from the reviewer's text (see quizzes.js)
 *   Write my own     start an empty quiz and add questions by hand
 *   Sample quiz      a shuffled set of built-in sample questions
 * Quizzes are saved, editable and retakeable. Each attempt keeps a copy of the questions it was graded
 * against, so its results stay correct even if the quiz is edited or deleted later.
 *   /quizzes/create            create, and the list of saved quizzes
 *   /quizzes/:id/edit          review, edit and add questions
 *   /quizzes/:id/take          take a quiz (the runner is in quizRunner.jsx, Patch 13)
 * Results, history and missed-question retakes are in quizResults.jsx (Patch 14).
 */
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const when = (d) => new Date(d).toLocaleString('en-US', { month: 'short', day: '2-digit', hour: 'numeric', minute: '2-digit' });
const Empty = ({ icon: I, title, text, children }) => <div className="empty-state"><I size={32} /><b>{title}</b><p>{text}</p>{children}</div>;
const Btn = ({ children, v = 'primary', icon: I, ...p }) => <button type="button" className={`btn ${v}`} {...p}>{I && <I size={16} />}<span>{children}</span></button>;
const Notice = ({ children }) => <div className="notice error" role="alert"><AlertCircle size={16} />{children}</div>;
const LETTERS = 'ABCD';

/* ---------- Create ---------- */
export function QuizCreate() {
  const nav = useNavigate(); const [sp] = useSearchParams(); const lib = useQuizLibrary(); const [reviewers] = useReviewers();
  const sorted = useMemo(() => [...reviewers].sort((a, b) => updatedAt(b) - updatedAt(a)), [reviewers]);
  const wanted = sp.get('reviewer');
  const [mode, setMode] = useState(sorted.length ? 'reviewer' : 'sample');
  const [rid, setRid] = useState(() => (sorted.some((r) => r.id === wanted) ? wanted : sorted[0] ? sorted[0].id : ''));
  const [title, setTitle] = useState(''); const [count, setCount] = useState('10'); const [types, setTypes] = useState({ mcq: true, tf: true });
  const [err, setErr] = useState(''); const [del, setDel] = useState(null);
  const reviewer = sorted.find((r) => r.id === rid) || sorted[0];
  const counts = mode === 'sample' ? COUNTS.filter((n) => Number(n) <= SAMPLE_MAX) : COUNTS;
  const shownCount = counts.includes(count) ? count : counts[counts.length - 1];
  const defaultTitle = mode === 'reviewer' ? cleanQuizTitle(`Quiz: ${reviewer ? reviewer.title : 'my reviewer'}`) : mode === 'sample' ? 'Sample quiz' : '';
  const switchMode = (m) => { setMode(m); setErr(''); };

  const finish = (quiz, then) => {
    const id = lib.add(quiz); if (!id) { setErr(`You can keep up to ${MAX_QUIZZES} quizzes. Delete one to make room.`); return; }
    logEvent(`Quiz created: ${quiz.title.slice(0, 80)}`); then(id);
  };
  const create = (e) => {
    e.preventDefault(); setErr(''); const name = cleanQuizTitle(title) || defaultTitle;
    if (mode === 'manual') { if (!name) { setErr('Give your quiz a title.'); return; } finish(makeQuiz({ title: name, source: 'manual' }), (id) => { toast('Quiz created'); nav(`/quizzes/${id}/edit`, { state: { fresh: 'manual' } }); }); return; }
    if (mode === 'sample') { finish(makeQuiz({ title: name, source: 'sample', questions: sampleQuestions(shownCount) }), (id) => { toast('Sample quiz ready'); nav(`/quizzes/${id}/take`); }); return; }
    if (!reviewer) { setErr('Choose a reviewer first.'); return; }
    let out; try { out = generateFromReviewer({ body: reviewer.body, count: Number(shownCount), types: Object.keys(types).filter((t) => types[t]) }); } catch (x) { setErr(x.message); return; }
    finish(makeQuiz({ title: name, source: 'reviewer', sourceTitle: reviewer.title, questions: out.questions }), (id) => { toast(out.short ? `Built ${plural(out.questions.length, 'question')}, all this reviewer supports` : 'Quiz generated'); nav(`/quizzes/${id}/edit`, { state: { fresh: 'reviewer', short: out.short } }); });
  };

  return <>
    <SectionTitle title="Create Quiz" subtitle="Check your understanding with a practice quiz." action={<div className="head-actions"><Btn v="outline" icon={HistoryIcon} onClick={() => nav('/quizzes/attempts')}>History</Btn></div>} />
    <div className="builder-layout"><form className="panel builder-form" onSubmit={create} noValidate>
      <div className="segmented qz-mode" role="group" aria-label="How to make the quiz">{[['reviewer', 'From a reviewer'], ['manual', 'Write my own'], ['sample', 'Sample quiz']].map(([k, l]) => <button type="button" key={k} className={mode === k ? 'selected' : ''} aria-pressed={mode === k} onClick={() => switchMode(k)}>{l}</button>)}</div>
      {mode === 'reviewer' && (sorted.length === 0 ? <Empty icon={Sparkles} title="No reviewers yet" text="Build a reviewer first and the quiz can use its definitions and key points."><Btn icon={Sparkles} onClick={() => nav('/reviewers/create')}>Create a reviewer</Btn></Empty> : <>
        <label className="field-label" htmlFor="qz-rev">Source reviewer</label>
        <select id="qz-rev" className="field" value={reviewer ? reviewer.id : ''} onChange={(e) => setRid(e.target.value)}>{sorted.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}</select></>)}
      {(mode !== 'reviewer' || sorted.length > 0) && <>
        <label className="field-label" htmlFor="qz-title">Quiz title{mode === 'manual' ? '' : ' (optional)'}</label>
        <input id="qz-title" className="field" value={title} maxLength={MAX_TITLE} placeholder={defaultTitle || 'e.g. Chapter 3 check'} onChange={(e) => { setTitle(e.target.value); setErr(''); }} />
        {mode !== 'manual' && <><label className="field-label">Number of questions</label>
          <div className="segmented" role="group" aria-label="Number of questions">{counts.map((n) => <button type="button" key={n} className={shownCount === n ? 'selected' : ''} aria-pressed={shownCount === n} onClick={() => setCount(n)}>{n}</button>)}</div></>}
        {mode === 'reviewer' && <><label className="field-label">Question types</label>
          <div className="check-list">{Object.keys(TYPE_LABELS).map((t) => <label key={t}><input type="checkbox" checked={types[t]} onChange={(e) => { setTypes({ ...types, [t]: e.target.checked }); setErr(''); }} /> {TYPE_LABELS[t]}</label>)}</div></>}
        {mode === 'manual' && <p className="muted">You will add the questions, answer options and correct answers on the next screen.</p>}
        {err && <Notice>{err}</Notice>}
        <Button type="submit" icon={mode === 'manual' ? Pencil : Sparkles}>{mode === 'manual' ? 'Start writing' : mode === 'sample' ? 'Make sample quiz' : 'Generate quiz'}</Button></>}
    </form>
      <div className="panel preview-panel"><div className="preview-icon"><BrainCircuit size={20} /></div><h3>Quiz settings</h3>
        <p>{mode === 'reviewer' ? 'Questions are built from the definitions, key points and review questions in your reviewer.' : mode === 'manual' ? 'You decide every question and answer.' : 'A random mix from the built-in sample questions.'}</p>
        {mode !== 'manual' && <div className="setting-line"><span>Questions</span><b>{shownCount}</b></div>}
        {mode === 'reviewer' && <div className="setting-line"><span>Types</span><b>{Object.keys(types).filter((t) => types[t]).map((t) => TYPE_LABELS[t]).join(', ') || 'None'}</b></div>}
        <div className="setting-line"><span>Estimated time</span><b>{mode === 'manual' ? 'Depends on length' : `${Math.max(1, Math.round(Number(shownCount) * 1.2))} min`}</b></div>
        <div className="privacy-note"><CheckCircle2 size={16} /> Answers include explanations after you submit.</div>
        {mode === 'reviewer' && <p className="muted" style={{ marginTop: 12 }}>Demo generator: it uses simple text rules, not a real AI model. Review the questions before you take the quiz.</p>}</div></div>

    {lib.items.length > 0 && <div className="panel list-panel" style={{ marginTop: 17 }}><div className="list-head"><h3>Your quizzes ({lib.items.length})</h3></div>
      <div className="qz-list">{lib.items.map((q) => <div className="qz-row" key={q.id}><div><b>{q.title}</b><small>{plural(q.questions.length, 'question')} · {sourceLabel(q)} · updated {when(q.updated || q.created)}</small></div>
        <div className="qz-row-tools"><Btn v="soft" icon={Play} disabled={!q.questions.length} onClick={() => nav(`/quizzes/${q.id}/take`)}>Take</Btn><Btn v="outline" icon={Pencil} onClick={() => nav(`/quizzes/${q.id}/edit`)}>Edit</Btn><button type="button" className="plain-icon" aria-label={`Delete ${q.title}`} onClick={() => setDel(q)}><Trash2 size={16} /></button></div></div>)}</div></div>}
    <RecentAttempts />
    {del && <ConfirmDialog icon={Trash2} title={`Delete “${del.title}”?`} body="This removes the quiz and its questions. Your past results are kept." confirmLabel="Delete" onCancel={() => setDel(null)} onConfirm={() => { lib.remove(del.id); logEvent(`Quiz deleted: ${del.title.slice(0, 80)}`); setDel(null); toast('Quiz deleted'); }} />}
  </>;
}

/* ---------- Editor ---------- */
function QuestionForm({ initial, submitLabel, onSubmit, onCancel }) {
  const gid = useId();
  const [type, setType] = useState(initial ? initial.type : 'mcq'); const [q, setQ] = useState(initial ? initial.q : '');
  const [options, setOptions] = useState(initial && initial.type === 'mcq' ? initial.options : ['', '', '', '']);
  const [answer, setAnswer] = useState(initial ? initial.answer : null); const [explanation, setExplanation] = useState(initial ? initial.explanation || '' : ''); const [err, setErr] = useState('');
  const touch = () => setErr('');
  const setOpt = (i, v) => { setOptions((o) => o.map((x, k) => (k === i ? v : x))); touch(); };
  const removeOpt = (i) => { setOptions((o) => o.filter((_, k) => k !== i)); setAnswer((a) => (a === null ? a : a === i ? null : a > i ? a - 1 : a)); touch(); };
  const pickType = (t) => { setType(t); setAnswer(null); touch(); };
  const submit = (e) => {
    e.preventDefault(); const msg = onSubmit({ type, q, options: type === 'tf' ? TF : options, answer, explanation });
    if (msg) { setErr(msg); return; }
    if (!initial) { setQ(''); setOptions(['', '', '', '']); setAnswer(null); setExplanation(''); setErr(''); }
  };
  return <form className="qz-form" onSubmit={submit} noValidate>
    <div className="segmented" role="group" aria-label="Question type">{Object.entries(TYPE_LABELS).map(([k, l]) => <button type="button" key={k} className={type === k ? 'selected' : ''} aria-pressed={type === k} onClick={() => pickType(k)}>{l}</button>)}</div>
    <label className="ufield"><span>Question</span><textarea rows="2" maxLength={MAX_Q} value={q} autoFocus={!!initial} placeholder={type === 'tf' ? 'Write a statement that is true or false' : 'Write the question'} onChange={(e) => { setQ(e.target.value); touch(); }} /></label>
    {type === 'tf' ? <fieldset><legend>Correct answer</legend><div className="qz-tf">{TF.map((l, i) => <label key={l}><input type="radio" name={gid} checked={answer === i} onChange={() => { setAnswer(i); touch(); }} /> {l}</label>)}</div></fieldset> :
      <fieldset><legend>Answer options <span className="qz-hint">(select the correct one)</span></legend>
        {options.map((o, i) => <div className="qz-opt" key={i}><input type="radio" name={gid} aria-label={`Mark option ${LETTERS[i]} as correct`} checked={answer === i} onChange={() => { setAnswer(i); touch(); }} />
          <input type="text" aria-label={`Option ${LETTERS[i]}`} placeholder={`Option ${LETTERS[i]}`} value={o} maxLength={140} onChange={(e) => setOpt(i, e.target.value)} />
          {options.length > MIN_OPTIONS && <button type="button" className="plain-icon" aria-label={`Remove option ${LETTERS[i]}`} onClick={() => removeOpt(i)}><X size={16} /></button>}</div>)}
        {options.length < MAX_OPTIONS && <div><button type="button" className="link-btn" onClick={() => setOptions((o) => [...o, ''])}><Plus size={14} /> Add option</button></div>}</fieldset>}
    <label className="ufield"><span>Explanation <em>(optional, shown in your results)</em></span><textarea rows="2" maxLength={MAX_EXPLANATION} value={explanation} onChange={(e) => { setExplanation(e.target.value); touch(); }} /></label>
    {err && <Notice>{err}</Notice>}
    <div className="form-actions">{onCancel && <Button variant="outline" onClick={onCancel}>Cancel</Button>}<Button type="submit" icon={initial ? Check : Plus}>{submitLabel}</Button></div>
  </form>;
}

export function QuizEditor() {
  const { id } = useParams(); const nav = useNavigate(); const { state } = useLocation(); const lib = useQuizLibrary(); const quiz = lib.items.find((x) => x.id === id);
  const [title, setTitle] = useState(quiz ? quiz.title : ''); const [titleErr, setTitleErr] = useState(''); const [editing, setEditing] = useState(null); const [dlg, setDlg] = useState(null);
  useEffect(() => { if (editing && quiz && !quiz.questions.some((x) => x.id === editing)) setEditing(null); }, [quiz, editing]);
  if (!quiz) return <Empty icon={BookOpen} title="Quiz not found" text="It may have been deleted."><Btn onClick={() => nav('/quizzes/create')}>Back to quizzes</Btn></Empty>;
  const n = quiz.questions.length; const dirty = cleanQuizTitle(title) !== quiz.title;
  const saveTitle = (e) => { e.preventDefault(); if (!lib.rename(quiz.id, title)) { setTitleErr('Give your quiz a title.'); return; } setTitleErr(''); setTitle(cleanQuizTitle(title)); toast('Quiz saved'); };
  const fresh = state && state.fresh;

  return <>
    <SectionTitle title="Edit quiz" subtitle={`${plural(n, 'question')} · ${sourceLabel(quiz)}`} action={<div className="head-actions">
      <Btn v="outline" icon={ArrowUpRight} onClick={() => nav('/quizzes/create')}>All quizzes</Btn>
      <Btn v="outline" icon={Trash2} onClick={() => setDlg('quiz')}>Delete quiz</Btn>
      <Btn icon={Play} disabled={!n} onClick={() => nav(`/quizzes/${quiz.id}/take`)}>Take quiz</Btn></div>} />
    <div className="qz-editor">
      {fresh === 'reviewer' && <div className="notice" role="status"><Sparkles size={16} />{state.short ? `That is every question this reviewer could support (${n}). ` : ''}Look the questions over before you take the quiz. The demo generator can get things wrong, so fix or delete anything that does not look right.</div>}
      {fresh === 'manual' && <div className="notice" role="status"><Pencil size={16} />Add your first question below.</div>}
      <form className="panel" onSubmit={saveTitle} noValidate><label className="ufield"><span>Quiz title</span><input value={title} maxLength={MAX_TITLE} onChange={(e) => { setTitle(e.target.value); setTitleErr(''); }} /></label>
        {titleErr && <Notice>{titleErr}</Notice>}<div className="form-actions" style={{ marginTop: 12, alignItems: 'center' }}>{dirty && <span className="muted" role="status" style={{ marginRight: 'auto' }}>Unsaved changes</span>}<Button type="submit" icon={Check}>Save title</Button></div></form>
      <div className="panel"><div className="list-head"><h3>Questions ({n})</h3></div>
        {n === 0 && <p className="muted">No questions yet. Add one below.</p>}
        <div>{quiz.questions.map((x, i) => <div className={`qz-q${editing === x.id ? ' editing' : ''}`} key={x.id}>
          {editing === x.id ? <QuestionForm initial={x} submitLabel="Save question" onCancel={() => setEditing(null)} onSubmit={(input) => { const m = lib.editQuestion(quiz.id, x.id, input); if (!m) { setEditing(null); toast('Question saved'); } return m; }} /> : <>
            <span className="fc-num">{i + 1}</span>
            <div className="qz-q-text"><b>{x.q}</b><ol>{x.options.map((o, k) => <li key={k} className={k === x.answer ? 'right' : ''}>{LETTERS[k]}. {o}{k === x.answer ? ' (correct)' : ''}</li>)}</ol>{x.explanation && <p className="muted">{x.explanation}</p>}</div>
            <div className="fc-row-tools"><button type="button" className="plain-icon" aria-label={`Edit question ${i + 1}`} onClick={() => setEditing(x.id)}><Pencil size={16} /></button><button type="button" className="plain-icon" aria-label={`Delete question ${i + 1}`} onClick={() => setDlg({ question: x, index: i })}><Trash2 size={16} /></button></div></>}
        </div>)}</div></div>
      <div className="panel"><h3>Add a question</h3><p className="muted">{n >= MAX_QUESTIONS ? `This quiz has the most questions it can hold (${MAX_QUESTIONS}).` : `Up to ${MAX_QUESTIONS} questions per quiz.`}</p>
        {n < MAX_QUESTIONS && <QuestionForm submitLabel="Add question" onSubmit={(input) => { const m = lib.addQuestion(quiz.id, input); if (!m) toast('Question added'); return m; }} />}</div>
    </div>
    {dlg === 'quiz' && <ConfirmDialog icon={Trash2} title={`Delete “${quiz.title}”?`} body="This removes the quiz and its questions. Your past results are kept." confirmLabel="Delete" onCancel={() => setDlg(null)} onConfirm={() => { lib.remove(quiz.id); logEvent(`Quiz deleted: ${quiz.title.slice(0, 80)}`); toast('Quiz deleted'); nav('/quizzes/create'); }} />}
    {dlg && dlg.question && <ConfirmDialog icon={Trash2} title={`Delete question ${dlg.index + 1}?`} body={`“${dlg.question.q.slice(0, 100)}” will be removed from the quiz.`} confirmLabel="Delete" onCancel={() => setDlg(null)} onConfirm={() => { lib.removeQuestion(quiz.id, dlg.question.id); setDlg(null); toast('Question deleted'); }} />}
  </>;
}

/* ---------- Take ---------- */
/** Question objects for the sample set that older links (/quizzes/ml-10/take) and old attempts used. */
const legacyQuestions = (n) => BANK.slice(0, Math.max(1, Math.min(n, BANK.length))).map(([q, options, answer, explanation], i) => ({ id: `b${i}`, type: 'mcq', q, options, answer, explanation }));

export function QuizTake() {
  const { id } = useParams(); const nav = useNavigate(); const lib = useQuizLibrary(); const me = useProfile();
  const saved = lib.items.find((x) => x.id === id); const legacy = !saved && /^ml-(\d+)$/.exec(id);
  const quiz = saved ? { quizId: saved.id, title: saved.title, questions: saved.questions } : legacy ? { quizId: '', title: 'Practice quiz', questions: legacyQuestions(parseInt(legacy[1], 10) || 5) } : null;
  if (!quiz) return <Empty icon={BookOpen} title="Quiz not found" text="It may have been deleted."><Btn onClick={() => nav('/quizzes/create')}>Back to quizzes</Btn></Empty>;
  if (!quiz.questions.length) return <Empty icon={BookOpen} title="This quiz has no questions yet" text="Add at least one question, then take the quiz."><Btn icon={Pencil} onClick={() => nav(`/quizzes/${id}/edit`)}>Add questions</Btn></Empty>;
  const qs = quiz.questions.map(toTuple);
  const finish = (ans, meta) => { // `ans` has null for any question left unanswered
    const attemptId = saveAttempt({ questions: quiz.questions, ans, secs: meta.secs, title: quiz.title, quizId: quiz.quizId }, me);
    nav('/quizzes/attempts/' + attemptId, { replace: true }); // Back should not return to a finished quiz
  };
  return <><SectionTitle title="Take Quiz" subtitle={quiz.title} /><QuizRunner key={id} qs={qs} label="PRACTICE QUIZ" exitTo={saved ? '/quizzes/create' : '/dashboard'} onFinish={finish} /></>;
}
