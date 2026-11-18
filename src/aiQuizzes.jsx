import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Sparkles, BookOpen, RotateCcw, CheckCircle2, History, ArrowLeft } from 'lucide-react';
import { SectionTitle } from './ui.jsx';
import { useMaterials } from './materials.jsx';
import { getFile } from './files.js';
import { supabase } from './lib/supabase.js';

const wrap = { maxWidth: 960, margin: '0 auto' };
const panel = { background: 'var(--surface, #fff)', border: '1px solid #dbe5f7', borderRadius: 20, padding: 24, marginBottom: 18 };
const field = { width: '100%', border: '1px solid #dbe5f7', borderRadius: 10, padding: '12px 14px', background: 'var(--surface, #fff)', color: 'inherit', font: 'inherit' };
const primary = { background: '#2563eb', color: '#fff', border: 0, borderRadius: 10, padding: '12px 20px', cursor: 'pointer', font: 'inherit', fontWeight: 600 };
const secondary = { ...primary, background: '#edf3ff', color: '#1d4ed8' };
const errorText = { color: '#c42648', marginTop: 12 };
const normalize = (s) => String(s ?? '').normalize('NFKC').toLocaleLowerCase().replace(/[.,!?;:]+$/g, '').replace(/\s+/g, ' ').trim();
const correct = (q, response) => q.type === 'identification'
  ? normalize(response) !== '' && normalize(response) === normalize(q.answer)
  : Number.isInteger(response) && response === q.answer;
const titleOf = (quiz) => quiz?.title || 'AI Quiz';
const message = (e) => e?.message || 'Something went wrong. Please try again.';
const api = async (operation) => {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Please sign in again.');
  return operation(user.id);
};
const read = async (query) => {
  const { data, error } = await query;
  if (error) throw error;
  return data;
};
const scoreOf = (qs, answers) => qs.reduce((n, q, i) => n + Number(correct(q, answers[i])), 0);
const kind = (q) => q.type === 'mcq' ? 'Multiple choice' : q.type === 'tf' ? 'True or false' : 'Identification';

export default function AIQuizzes() {
  const nav = useNavigate();
  const { id, attemptId } = useParams();
  const { items: materials } = useMaterials();
  const [quizzes, setQuizzes] = useState([]);
  const [quiz, setQuiz] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [attempt, setAttempt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [mode, setMode] = useState('material');
  const [materialId, setMaterialId] = useState('');
  const [paste, setPaste] = useState('');
  const [title, setTitle] = useState('');
  const [count, setCount] = useState(10);
  const [difficulty, setDifficulty] = useState('medium');
  const [types, setTypes] = useState(['mcq', 'tf', 'identification']);
  const [generated, setGenerated] = useState([]);
  const [answers, setAnswers] = useState([]);
  const [submitted, setSubmitted] = useState(false);
  const [missedOnly, setMissedOnly] = useState(false);
  const [sourceAttempt, setSourceAttempt] = useState(null);

  const path = window.location.pathname;
  const isResults = path.includes('/results/');
  const isRetake = path.includes('/retake/');
  const isTaking = !!id && !isResults;
  const questions = useMemo(() => {
    if (!quiz) return [];
    if (!isRetake || !sourceAttempt) return quiz.questions || [];
    const saved = sourceAttempt.answers || {};
    const snapshot = Array.isArray(saved.questions) ? saved.questions : (quiz.questions || []);
    const responses = Array.isArray(saved.responses) ? saved.responses : [];
    return snapshot.filter((q, i) => !correct(q, responses[i]));
  }, [quiz, isRetake, sourceAttempt]);
  const resultQuestions = Array.isArray(attempt?.answers?.questions) ? attempt.answers.questions : (quiz?.questions || []);
  const resultAnswers = Array.isArray(attempt?.answers?.responses) ? attempt.answers.responses : [];
  const missed = resultQuestions.filter((q, i) => !correct(q, resultAnswers[i])).length;

  useEffect(() => {
    let active = true;
    setLoading(true); setErr(''); setQuiz(null); setAttempt(null); setSourceAttempt(null);
    api(async (userId) => {
      if (!id) {
        const list = await read(supabase.from('quizzes').select('id,title,questions,created_at').eq('owner_id', userId).order('created_at', { ascending: false }));
        if (active) setQuizzes(list || []);
      } else {
        const row = await read(supabase.from('quizzes').select('id,title,questions,created_at').eq('id', id).eq('owner_id', userId).single());
        if (active) setQuiz(row);
        if (attemptId) {
          const record = await read(supabase.from('quiz_attempts').select('id,quiz_id,score,total,answers,created_at').eq('id', attemptId).eq('quiz_id', id).eq('user_id', userId).single());
          if (active) { if (isResults) setAttempt(record); else setSourceAttempt(record); }
        }
      }
    }).catch((e) => { if (active) setErr(message(e)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, attemptId, isResults]);

  useEffect(() => {
    if (isTaking && quiz && (!isRetake || sourceAttempt)) {
      setAnswers(questions.map(() => null)); setSubmitted(false);
    }
  }, [id, attemptId, quiz, sourceAttempt, isRetake]); // reset on each new session

  const loadAttempts = async (quizId) => {
    try {
      const data = await api((userId) => read(supabase.from('quiz_attempts').select('id,score,total,created_at').eq('quiz_id', quizId).eq('user_id', userId).order('created_at', { ascending: false }).limit(20)));
      setAttempts(data || []);
    } catch (e) { setErr(message(e)); }
  };
  useEffect(() => { if (quiz && !isRetake && !isResults) loadAttempts(quiz.id); }, [quiz?.id, isRetake, isResults]);

  const generate = async (e) => {
    e.preventDefault(); if (busy) return;
    setBusy(true); setErr(''); setGenerated([]);
    try {
      let source = paste.trim();
      if (mode === 'material') {
        const m = materials.find((x) => x.id === materialId);
        if (!m) throw new Error('Choose an uploaded material.');
        const blob = await getFile(m.id);
        if (!blob) throw new Error('Original file unavailable. Re-upload the material first.');
        const extracted = await (await import('./extract.js')).extractMaterial(blob, m.type);
        source = extracted.text || '';
        if (extracted.pdfDoc?.destroy) await extracted.pdfDoc.destroy();
        if (extracted.scanned || !source.trim()) throw new Error('No readable text found in the document.');
      }
      if (source.length < 100) throw new Error('Provide at least 100 characters of study material.');
      if (!types.length) throw new Error('Choose at least one question type.');
      if (!supabase) throw new Error('Supabase is not configured.');
      const { data, error } = await supabase.functions.invoke('generate-quiz', {
        body: { text: source.slice(0, 28000), materialId: mode === 'material' ? materialId : null, count, difficulty, types },
      });
      if (error) {
        let detail = error.message;
        try { if (error.context?.json) detail = (await error.context.json()).error || detail; } catch { /* network error */ }
        throw new Error(detail);
      }
      if (!Array.isArray(data?.questions) || data.questions.length !== count) throw new Error(data?.error || 'The AI did not return the requested questions.');
      setGenerated(data.questions);
    } catch (e) { setErr(message(e)); } finally { setBusy(false); }
  };
  const save = async () => {
    if (busy || !generated.length) return;
    setBusy(true); setErr('');
    try {
      const name = title.trim() || (mode === 'material' ? (materials.find((m) => m.id === materialId)?.name || 'Material') + ' AI Quiz' : 'My AI Quiz');
      const saved = await api((userId) => read(supabase.from('quizzes').insert({
        owner_id: userId, title: name.slice(0, 120), questions: generated,
      }).select('id').single()));
      nav('/quizzes/ai/' + saved.id);
    } catch (e) { setErr(message(e)); } finally { setBusy(false); }
  };
  const submit = async () => {
    if (busy || submitted || !questions.length) return;
    setBusy(true); setErr('');
    try {
      const score = scoreOf(questions, answers);
      const saved = await api((userId) => read(supabase.from('quiz_attempts').insert({
        quiz_id: id, user_id: userId, score, total: questions.length,
        answers: { responses: answers, questions, kind: isRetake ? 'missed' : 'full', fromAttempt: isRetake ? attemptId : null },
      }).select('id').single()));
      setSubmitted(true);
      nav('/quizzes/ai/' + id + '/results/' + saved.id);
    } catch (e) { setErr('Your attempt was not saved: ' + message(e)); }
    finally { setBusy(false); }
  };
  const removeQuiz = async (quizId) => {
    if (!window.confirm('Delete this quiz and all its saved attempts?')) return;
    setBusy(true); setErr('');
    try {
      await api((userId) => read(supabase.from('quizzes').delete().eq('id', quizId).eq('owner_id', userId)));
      setQuizzes((prev) => prev.filter((q) => q.id !== quizId));
    } catch (e) { setErr(message(e)); } finally { setBusy(false); }
  };

  return <div style={wrap}>
    <SectionTitle title={isResults ? 'AI Quiz Results' : isTaking ? (isRetake ? 'Retake missed questions' : 'AI Quiz Session') : 'AI Quiz Generator'}
      subtitle={isResults ? 'Your saved score and answer explanations' : isTaking ? titleOf(quiz) : 'Generate and save real quizzes from your study materials using Gemini.'}
      action={<button type="button" style={secondary} onClick={() => nav('/quizzes/ai')}><ArrowLeft size={15} style={{ verticalAlign: 'middle', marginRight: 6 }} />All AI quizzes</button>} />
    {loading && <div style={panel}>Loading your quizzes from Supabase…</div>}
    {err && <div role="alert" style={{ ...panel, ...errorText }}>{err}</div>}
    {!loading && !id && <>
      <form style={panel} onSubmit={generate}>
        <h3 style={{ marginTop: 0 }}><Sparkles size={19} style={{ verticalAlign: 'middle', marginRight: 8 }} />Generate with Gemini</h3>
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <button type="button" style={mode === 'material' ? primary : secondary} onClick={() => { setMode('material'); setGenerated([]); }}>My materials</button>
          <button type="button" style={mode === 'paste' ? primary : secondary} onClick={() => { setMode('paste'); setGenerated([]); }}>Paste notes</button>
        </div>
        {mode === 'material' ? <label style={{ display: 'block', marginBottom: 14 }}>Source material
          <select style={field} value={materialId} onChange={(e) => { setMaterialId(e.target.value); setGenerated([]); }}>
            <option value="">Select a material</option>{materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label> : <label style={{ display: 'block', marginBottom: 14 }}>Study notes
          <textarea style={{ ...field, minHeight: 160 }} value={paste} maxLength={28000} placeholder="Paste at least 100 characters of notes…" onChange={(e) => { setPaste(e.target.value); setGenerated([]); }} />
        </label>}
        <label style={{ display: 'block', marginBottom: 14 }}>Quiz title (optional)
          <input style={field} maxLength={120} value={title} placeholder="e.g. Software Engineering Finals" onChange={(e) => setTitle(e.target.value)} />
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 15, marginBottom: 16 }}>
          <label>Questions <select style={field} value={count} onChange={(e) => { setCount(Number(e.target.value)); setGenerated([]); }}>{[5, 10, 15, 20].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
          <label>Difficulty <select style={field} value={difficulty} onChange={(e) => { setDifficulty(e.target.value); setGenerated([]); }}>{['easy', 'medium', 'hard'].map((d) => <option key={d} value={d}>{d[0].toUpperCase() + d.slice(1)}</option>)}</select></label>
        </div>
        <fieldset style={{ border: 0, padding: 0, marginBottom: 20 }}><legend>Question types</legend>
          {['mcq', 'tf', 'identification'].map((t) => <label key={t} style={{ display: 'inline-flex', gap: 7, marginRight: 20, marginTop: 8 }}>
            <input type="checkbox" checked={types.includes(t)} onChange={(e) => { setTypes((old) => e.target.checked ? [...old, t] : old.filter((x) => x !== t)); setGenerated([]); }} />{kind({ type: t })}
          </label>)}
        </fieldset>
        <button type="submit" disabled={busy} style={primary}>{busy ? 'Generating…' : 'Generate questions'}</button>
      </form>
      {!!generated.length && <section style={panel}><h3>Preview: {generated.length} questions</h3>
        <p style={{ color: '#64748b' }}>Review the generated questions and answer keys before saving.</p>
        {generated.map((q, i) => <div key={i} style={{ borderTop: '1px solid #dbe5f7', padding: '15px 0' }}>
          <small>{kind(q)} · {q.difficulty}</small><p><b>{i + 1}. {q.q}</b></p>
          {q.options?.map((o, k) => <p key={k} style={{ margin: '4px 0', color: k === q.answer ? '#15803d' : 'inherit' }}>{String.fromCharCode(65 + k)}. {o}{k === q.answer ? ' ✓' : ''}</p>)}
          {q.type === 'identification' && <p><b>Answer:</b> {q.answer}</p>}
          <p style={{ color: '#64748b' }}>{q.explanation}</p>
        </div>)}
        <button type="button" style={primary} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save quiz to Supabase'}</button>
      </section>}
      <section style={panel}><h3><History size={18} style={{ verticalAlign: 'middle' }} /> My saved AI quizzes</h3>
        {!quizzes.length && <p>No saved quizzes yet. Generate your first quiz above.</p>}
        {quizzes.map((q) => <div key={q.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, borderTop: '1px solid #dbe5f7', padding: '14px 0' }}>
          <div><b>{q.title}</b><p style={{ margin: '4px 0', color: '#64748b' }}>{q.questions?.length || 0} questions · {new Date(q.created_at).toLocaleDateString()}</p></div>
          <div style={{ display: 'flex', gap: 8 }}><button type="button" style={primary} onClick={() => nav('/quizzes/ai/' + q.id)}>Study</button>
            <button type="button" style={secondary} disabled={busy} onClick={() => removeQuiz(q.id)}>Delete</button></div>
        </div>)}
      </section>
    </>}
    {!loading && isTaking && quiz && (!isRetake || sourceAttempt) && <section style={panel}>
      <p style={{ color: '#64748b' }}>{questions.length} questions · {isRetake ? 'Incorrect and unanswered questions only' : 'Your answers will be saved after submission.'}</p>
      {!questions.length ? <p>There are no missed questions to retake. Great work!</p> : <>
        {questions.map((q, i) => <div key={i} style={{ padding: '18px 0', borderTop: '1px solid #dbe5f7' }}>
          <small>{kind(q)} · {q.difficulty || 'medium'}</small><p><b>{i + 1}. {q.q}</b></p>
          {q.type === 'identification' ? <input style={field} placeholder="Type your answer" value={answers[i] ?? ''} onChange={(e) => setAnswers((a) => a.map((v, k) => k === i ? e.target.value : v))} /> :
            q.options.map((option, k) => <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, cursor: 'pointer' }}>
              <input type="radio" name={'ai-q-' + i} checked={answers[i] === k} onChange={() => setAnswers((a) => a.map((v, n) => n === i ? k : v))} />{option}
            </label>)}
        </div>)}
        <button type="button" style={primary} disabled={busy || submitted} onClick={submit}>{busy ? 'Saving result…' : 'Submit and see results'}</button>
      </>}
      {!!attempts.length && !isRetake && <div style={{ marginTop: 24 }}><h3>Previous attempts</h3>{attempts.map((a) => <p key={a.id}><button type="button" style={secondary} onClick={() => nav('/quizzes/ai/' + id + '/results/' + a.id)}>{a.score}/{a.total} · {new Date(a.created_at).toLocaleString()}</button></p>)}</div>}
    </section>}
    {!loading && isResults && attempt && <section style={panel}>
      <h2 style={{ marginTop: 0 }}><CheckCircle2 size={24} style={{ verticalAlign: 'middle' }} /> Score: {attempt.score} / {attempt.total} ({Math.round(attempt.score / Math.max(1, attempt.total) * 100)}%)</h2>
      <p>{missed} incorrect or unanswered · Saved {new Date(attempt.created_at).toLocaleString()}</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '18px 0' }}>
        <button type="button" style={primary} onClick={() => nav('/quizzes/ai/' + id)}>Retake full quiz</button>
        {missed > 0 && <button type="button" style={secondary} onClick={() => nav('/quizzes/ai/' + id + '/retake/' + attempt.id)}><RotateCcw size={15} style={{ verticalAlign: 'middle' }} /> Retake {missed} missed</button>}
      </div>
      {resultQuestions.map((q, i) => <div key={i} style={{ borderTop: '1px solid #dbe5f7', padding: '16px 0' }}>
        <p><b>{i + 1}. {q.q}</b> <span style={{ color: correct(q, resultAnswers[i]) ? '#15803d' : '#c42648' }}>{correct(q, resultAnswers[i]) ? '✓ Correct' : '✗ Incorrect'}</span></p>
        <p>Your answer: {q.type === 'identification' ? (resultAnswers[i] || 'Unanswered') : (q.options?.[resultAnswers[i]] || 'Unanswered')}</p>
        <p><b>Correct answer:</b> {q.type === 'identification' ? q.answer : q.options?.[q.answer]}</p>
        <p style={{ color: '#64748b' }}><b>Explanation:</b> {q.explanation}</p>
      </div>)}
    </section>}
  </div>;
}
