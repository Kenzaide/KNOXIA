import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowUpRight, BookOpen, CheckCircle2, Clock3, History, ListChecks, MinusCircle, RotateCcw, Target, Trash2, TrendingDown, TrendingUp, XCircle } from 'lucide-react';
import { ConfirmDialog, SectionTitle } from './ui.jsx';
import { toast } from './materials.jsx';
import { useProfile } from './accounts.js';
import { KEYS, logEvent, pushLS } from './data.js';
import { useQuizLibrary } from './quizzes.js';
import { QuizRunner } from './quizRunner.jsx';
import { MISSED_SUFFIX, LETTERS, attemptTitle, fmtDuration, gradeAttempt, pctOf, sameQuiz, timeOf, useAttemptHistory } from './attempts.js';

/**
 * Assessment results (Patch 14).
 *   /quizzes/attempts                 history of every attempt, with filters and a score trend
 *   /quizzes/attempts/:id             the score, a correct / incorrect / unanswered breakdown, and every answer with its explanation
 *   /quizzes/attempts/:id/missed      retake only the questions that were missed in that attempt
 * Each attempt keeps a copy of the questions it was graded on (see attempts.js), so old results stay correct.
 */
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const when = (d) => new Date(d).toLocaleString('en-US', { month: 'short', day: '2-digit', hour: 'numeric', minute: '2-digit' });
const whenFull = (d) => new Date(d).toLocaleString('en-US', { month: 'short', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const Empty = ({ icon: I, title, text, children }) => <div className="empty-state"><I size={32} /><b>{title}</b><p>{text}</p>{children}</div>;
const Btn = ({ children, v = 'primary', icon: I, ...p }) => <button type="button" className={`btn ${v}`} {...p}>{I && <I size={16} />}<span>{children}</span></button>;
const Stat = ({ label, value, note, icon: I, tone = '' }) => <div className="stat-card"><div className={`stat-icon ${tone}`}><I size={18} /></div><div className="stat-copy"><span>{label}</span><strong>{value}</strong><small>{note}</small></div></div>;
const tone = (pct) => (pct >= 80 ? 'good' : pct >= 50 ? 'mid' : 'low');
const STATUS = { correct: ['active', 'Correct'], wrong: ['wrong', 'Incorrect'], skipped: ['pending', 'Not answered'] };

/** Saves a finished attempt and opens its results. `extra` is anything beyond the basics (e.g. kind: 'missed'). */
export function saveAttempt({ questions, ans, secs, title, quizId = '', extra = {} }, me) {
  const a = {
    id: String(Date.now()), n: questions.length, ans, score: ans.filter((x, i) => x === questions[i].answer).length, date: new Date().toISOString(),
    quizId, title, questions, ...(typeof secs === 'number' ? { secs } : {}), ...extra,
  };
  pushLS(KEYS.attempts, a); logEvent(`Quiz submitted by ${me.displayName}: ${title.slice(0, 80)}`);
  return a.id;
}

/* ---------- Results ---------- */
export function QuizResults() { const { id } = useParams(); return <ResultsView key={id} id={id} />; } // a new attempt starts with a fresh filter

function ResultsView({ id }) {
  const nav = useNavigate(); const hist = useAttemptHistory(); const lib = useQuizLibrary();
  const [filter, setFilter] = useState('all'); const [del, setDel] = useState(false);
  const a = hist.items.find((x) => x.id === id);
  const g = useMemo(() => (a ? gradeAttempt(a) : null), [a]);
  if (!a) return <Empty icon={BookOpen} title="Attempt not found" text="It may have been deleted. Take a quiz to see your results here."><Btn onClick={() => nav('/quizzes/create')}>Create a quiz</Btn></Empty>;
  if (!g.n) return <Empty icon={BookOpen} title="This result has no questions" text="The questions for this attempt were not saved, so it cannot be shown."><Btn onClick={() => nav('/quizzes/attempts')}>Back to history</Btn></Empty>;

  const same = hist.items.filter((x) => sameQuiz(x, a)).sort((p, q) => timeOf(q) - timeOf(p) || (q.id > p.id ? 1 : -1));
  const at = same.findIndex((x) => x.id === a.id); const prev = at >= 0 ? same[at + 1] : null; const attemptNo = same.length - at;
  const best = Math.max(...same.map(pctOf)); const delta = prev ? g.pct - pctOf(prev) : 0;
  const missed = g.wrong + g.skipped; const time = fmtDuration(a.secs);

  // Where "Retake" goes: a saved quiz, the attempt a missed-question retake came from, or the old sample quiz.
  let retake = ''; let retakeNote = '';
  if (a.kind === 'missed') { if (hist.items.some((x) => x.id === a.fromAttempt)) retake = `/quizzes/attempts/${a.fromAttempt}/missed`; else retakeNote = 'The attempt these questions came from was deleted.'; }
  else if (a.quizId) { if (lib.items.some((x) => x.id === a.quizId)) retake = `/quizzes/${a.quizId}/take`; else retakeNote = 'The original quiz was deleted, so it cannot be retaken.'; }
  else retake = `/quizzes/ml-${a.n}/take`;

  const counts = { all: g.n, wrong: g.wrong, correct: g.correct, skipped: g.skipped };
  const shown = g.items.filter((it) => filter === 'all' || it.status === filter);
  const filters = [['all', 'All'], ['wrong', 'Incorrect'], ['correct', 'Correct'], ...(g.skipped ? [['skipped', 'Not answered']] : [])];
  const headline = g.pct >= 80 ? 'Great work!' : g.pct >= 50 ? 'Good effort. Review the misses below.' : 'Keep practicing. Review the answers below.';

  return <><SectionTitle title="Quiz Results / Review" subtitle={`${attemptTitle(a)} · Taken ${whenFull(a.date)}`} action={<div className="head-actions"><Btn v="outline" icon={History} onClick={() => nav('/quizzes/attempts')}>History</Btn></div>} />
    <div className="panel result-hero"><div className="score-ring" style={{ '--pct': g.pct }} role="img" aria-label={`Score ${g.pct} percent`}><b>{g.pct}%</b></div>
      <div style={{ flex: 1, minWidth: 220 }}><h3 style={{ fontSize: 20, margin: '0 0 4px' }}>{headline}</h3>
        <p className="muted">You got {g.correct} of {g.n} questions right{missed ? `, and ${missed} to review` : ''}.</p>
        {prev && <p className={`qres-delta ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}`}>{delta > 0 ? <TrendingUp size={16} /> : delta < 0 ? <TrendingDown size={16} /> : <Target size={16} />}
          {delta === 0 ? `Same as your last attempt (${pctOf(prev)}%)` : `${delta > 0 ? 'Up' : 'Down'} ${Math.abs(delta)} point${Math.abs(delta) === 1 ? '' : 's'} from your last attempt (${pctOf(prev)}%)`}</p>}
        {same.length > 1 && <p className="muted" style={{ margin: '4px 0 0' }}>Attempt {attemptNo} of {same.length} on this quiz · best score {best}%</p>}
        <div className="head-actions" style={{ justifyContent: 'flex-start', marginTop: 12 }}>
          {retake && <Btn icon={RotateCcw} onClick={() => nav(retake)}>Retake quiz</Btn>}
          {missed > 0 && <Btn v="soft" icon={ListChecks} onClick={() => nav(`/quizzes/attempts/${a.id}/missed`)}>Retake {plural(missed, 'missed question')}</Btn>}
          <Btn v="outline" onClick={() => nav('/quizzes/create')}>All quizzes</Btn></div>
        {retakeNote && <p className="muted" style={{ margin: '8px 0 0' }}>{retakeNote}</p>}</div></div>
    <div className="qres-stats" aria-label="Score breakdown">
      <div className="qres-stat ok"><CheckCircle2 size={18} /><div><strong>{g.correct}</strong><span>Correct</span></div></div>
      <div className="qres-stat bad"><XCircle size={18} /><div><strong>{g.wrong}</strong><span>Incorrect</span></div></div>
      {g.skipped > 0 && <div className="qres-stat skip"><MinusCircle size={18} /><div><strong>{g.skipped}</strong><span>Not answered</span></div></div>}
      {time && <div className="qres-stat"><Clock3 size={18} /><div><strong>{time}</strong><span>Time taken</span></div></div>}</div>

    <div className="list-head qres-head"><h3>Answer review</h3>
      <div className="segmented" role="group" aria-label="Filter answers">{filters.map(([k, l]) => <button type="button" key={k} className={filter === k ? 'selected' : ''} aria-pressed={filter === k} onClick={() => setFilter(k)}>{l} ({counts[k]})</button>)}</div></div>
    {shown.length === 0 && <p className="muted" role="status">{filter === 'wrong' ? 'No incorrect answers. Nice work!' : 'Nothing to show here.'}</p>}
    <div style={{ display: 'grid', gap: 13 }}>{shown.map((it) => { const [cls, text] = STATUS[it.status]; return <div className="panel qres-item" key={it.index}>
      <div className="deck-bottom"><b>{it.index + 1}. {it.q}</b><span className={`status-pill ${cls}`}>{text}</span></div>
      <ul className="opts">{it.options.map((o, k) => <li key={k} className={k === it.right ? 'right' : k === it.picked ? 'wrong' : ''}><span>{LETTERS[k]}</span>{o}
        {(k === it.right || k === it.picked) && <em>{k === it.right ? (k === it.picked ? 'Your answer · Correct' : 'Correct answer') : 'Your answer'}</em>}</li>)}</ul>
      {it.status === 'skipped' && <p className="qres-note">You did not answer this question.</p>}
      <div className="qres-expl"><b>Explanation</b><p>{it.explanation || 'No explanation was added for this question.'}</p></div></div>; })}</div>
    <div className="qres-foot"><Btn v="outline" icon={Trash2} onClick={() => setDel(true)}>Delete this result</Btn></div>
    {del && <ConfirmDialog icon={Trash2} title="Delete this result?" body="This removes it from your history. The quiz itself is not affected." confirmLabel="Delete" onCancel={() => setDel(false)} onConfirm={() => { hist.remove(a.id); toast('Result deleted'); nav('/quizzes/attempts', { replace: true }); }} />}
  </>;
}

/* ---------- Retake the missed questions ---------- */
export function QuizMissed() {
  const { id } = useParams(); const nav = useNavigate(); const hist = useAttemptHistory(); const me = useProfile();
  const a = hist.items.find((x) => x.id === id);
  const missed = useMemo(() => (a ? gradeAttempt(a).items.filter((it) => it.status !== 'correct') : []), [a]);
  if (!a) return <Empty icon={BookOpen} title="Attempt not found" text="It may have been deleted."><Btn onClick={() => nav('/quizzes/attempts')}>Back to history</Btn></Empty>;
  if (!missed.length) return <Empty icon={CheckCircle2} title="Nothing to retake" text="You answered every question in that attempt correctly."><Btn onClick={() => nav(`/quizzes/attempts/${a.id}`)}>Back to results</Btn></Empty>;
  const base = attemptTitle(a).replace(/( \(missed questions\))+$/, '');
  const questions = missed.map((it) => it.question);
  const finish = (ans, meta) => {
    const newId = saveAttempt({ questions, ans, secs: meta.secs, title: base + MISSED_SUFFIX, extra: { kind: 'missed', fromAttempt: a.id } }, me);
    nav(`/quizzes/attempts/${newId}`, { replace: true });
  };
  return <><SectionTitle title="Retake Missed Questions" subtitle={`${base} · ${plural(missed.length, 'question')} you missed`} />
    <QuizRunner key={id} qs={questions.map((q) => [q.q, q.options, q.answer, q.explanation || ''])} label="MISSED QUESTIONS" exitTo={`/quizzes/attempts/${a.id}`} onFinish={finish} /></>;
}

/* ---------- History ---------- */
const PAGE = 10;
const SORTS = [['new', 'Newest first'], ['old', 'Oldest first'], ['high', 'Highest score'], ['low', 'Lowest score']];

export function QuizHistory() {
  const nav = useNavigate(); const hist = useAttemptHistory();
  const [pick, setPick] = useState('all'); const [sort, setSort] = useState('new'); const [limit, setLimit] = useState(PAGE); const [dlg, setDlg] = useState(null);
  const rows = useMemo(() => hist.items.map((a) => ({ a, pct: pctOf(a), title: attemptTitle(a), at: timeOf(a) })), [hist.items]);
  const titles = useMemo(() => [...new Set(rows.map((r) => r.title))].sort((x, y) => x.localeCompare(y)), [rows]);
  const key = titles.includes(pick) ? pick : 'all';
  const filtered = rows.filter((r) => key === 'all' || r.title === key);
  const list = [...filtered].sort((x, y) => (sort === 'old' ? x.at - y.at : sort === 'high' ? y.pct - x.pct || y.at - x.at : sort === 'low' ? x.pct - y.pct || y.at - x.at : y.at - x.at));
  const chrono = [...filtered].sort((x, y) => x.at - y.at); const trend = chrono.slice(-12);
  const avg = filtered.length ? Math.round(filtered.reduce((s, r) => s + r.pct, 0) / filtered.length) : 0;
  const best = filtered.length ? Math.max(...filtered.map((r) => r.pct)) : 0; const latest = chrono[chrono.length - 1];
  const change = (setter) => (e) => { setter(e.target.value); setLimit(PAGE); };

  const header = <SectionTitle title="Quiz History" subtitle="Review your previous attempts and see how your scores change." action={<div className="head-actions">
    <Btn v="outline" icon={Trash2} disabled={!rows.length} onClick={() => setDlg('all')}>Clear history</Btn><Btn onClick={() => nav('/quizzes/create')}>Create a quiz</Btn></div>} />;
  if (!rows.length) return <>{header}<Empty icon={History} title="No attempts yet" text="Take a quiz and your results will be saved here."><Btn onClick={() => nav('/quizzes/create')}>Create a quiz</Btn></Empty></>;

  return <>{header}
    <div className="qh-toolbar"><label className="qh-pick"><span className="muted">Quiz</span>
      <select className="field" value={key} onChange={change(setPick)}><option value="all">All quizzes ({rows.length})</option>{titles.map((t) => <option key={t} value={t}>{t} ({rows.filter((r) => r.title === t).length})</option>)}</select></label>
      <label className="qh-pick"><span className="muted">Sort</span><select className="field" value={sort} onChange={change(setSort)}>{SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label></div>
    <div className="stats-grid"><Stat label="Attempts" value={String(filtered.length)} note={key === 'all' ? 'All quizzes' : 'This quiz'} icon={ListChecks} />
      <Stat label="Average score" value={`${avg}%`} note="Across these attempts" icon={Target} tone="green" />
      <Stat label="Best score" value={`${best}%`} note="Your highest" icon={TrendingUp} tone="orange" />
      <Stat label="Latest" value={`${latest.pct}%`} note={when(latest.a.date)} icon={Clock3} tone="purple" /></div>
    {trend.length > 1 && <div className="panel"><div className="deck-bottom"><h3>Score trend</h3><small className="muted">Last {trend.length} attempts, oldest to newest</small></div>
      <div className="qh-trend" role="list">{trend.map((r) => <Link role="listitem" key={r.a.id} to={`/quizzes/attempts/${r.a.id}`} className={`qh-bar ${tone(r.pct)}`} title={`${r.title}: ${r.pct}% · ${when(r.a.date)}`} aria-label={`${r.title}, ${r.pct} percent, ${when(r.a.date)}`}><span style={{ height: `${Math.max(r.pct, 4)}%` }} /></Link>)}</div>
      <div className="qh-labels" aria-hidden="true">{trend.map((r) => <small key={r.a.id}>{r.pct}%</small>)}</div></div>}
    <div className="panel list-panel" style={{ marginTop: 17 }}><div className="list-head"><h3>Attempts ({filtered.length})</h3></div>
      {list.slice(0, limit).map(({ a, pct, title }) => { const dur = fmtDuration(a.secs); return <div className="qh-row" key={a.id}>
        <div className={`qh-score ${tone(pct)}`} aria-label={`${pct} percent`}>{pct}%</div>
        <div className="qh-main"><b>{title}</b><small>{a.score} / {a.n} correct{dur ? ` · ${dur}` : ''} · {when(a.date)}</small></div>
        <div className="qz-row-tools"><Btn v="soft" icon={ListChecks} onClick={() => nav(`/quizzes/attempts/${a.id}`)}>Review</Btn>
          <button type="button" className="plain-icon" aria-label={`Delete the ${title} result from ${when(a.date)}`} onClick={() => setDlg({ a, title })}><Trash2 size={16} /></button></div></div>; })}
      {list.length > limit && <div style={{ textAlign: 'center', paddingTop: 12 }}><Btn v="outline" onClick={() => setLimit(limit + PAGE)}>Show {Math.min(PAGE, list.length - limit)} more ({list.length - limit} left)</Btn></div>}</div>
    {dlg === 'all' && <ConfirmDialog icon={Trash2} title="Clear all quiz history?" body={`This deletes all ${plural(rows.length, 'saved result')}. Your quizzes are not affected.`} confirmLabel="Clear history" onCancel={() => setDlg(null)} onConfirm={() => { hist.clear(); setDlg(null); toast('History cleared'); }} />}
    {dlg && dlg.a && <ConfirmDialog icon={Trash2} title="Delete this result?" body={`The ${dlg.title} result from ${when(dlg.a.date)} will be removed from your history.`} confirmLabel="Delete" onCancel={() => setDlg(null)} onConfirm={() => { hist.remove(dlg.a.id); setDlg(null); toast('Result deleted'); }} />}
  </>;
}

/* ---------- Recent attempts (shown under the quiz list) ---------- */
export function RecentAttempts() {
  const hist = useAttemptHistory(); const items = [...hist.items].sort((x, y) => timeOf(y) - timeOf(x));
  return <div className="panel list-panel" style={{ marginTop: 17 }}><div className="list-head"><h3>Recent attempts</h3>{items.length > 0 && <Link className="link-btn" to="/quizzes/attempts">View all history <ArrowUpRight size={16} /></Link>}</div>
    {items.length === 0 && <p className="muted">Your quiz results will appear here.</p>}
    {items.slice(0, 5).map((a) => <div className="generic-row" key={a.id}><div className={`activity-dot ${pctOf(a) >= 80 ? 'green' : 'orange'}`}><Target size={16} /></div><div><b>{pctOf(a)}% · {a.score} / {a.n} correct{a.title ? ` · ${a.title}` : ''}</b><small>{when(a.date)}</small></div><Link className="link-btn" to={'/quizzes/attempts/' + a.id}>Review <ArrowUpRight size={16} /></Link></div>)}</div>;
}
