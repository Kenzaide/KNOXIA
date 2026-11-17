import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowUpRight, BookOpen, Check, CheckCircle2, Clock3, Flame, Layers, RotateCcw, Sparkles, Target, TrendingDown, TrendingUp, Undo2 } from 'lucide-react';
import { Button, ConfirmDialog, SectionTitle } from './ui.jsx';
import { toast, fmtDate } from './materials.jsx';
import { logEvent } from './data.js';
import { REVIEWER_LABELS, fmtTime } from './progressCalc.js';
import { track, useStudyProgress } from './progressStore.js';

/**
 * Study Progress (Patch 15): one place that shows how far the student has got.
 *   reviewers    which are completed, in progress or not started; mark them as completed here or in the editor
 *   flashcards   mastery of every deck and when it was last studied
 *   quizzes      attempts, best and latest score per quiz, and the change since the previous attempt
 *   activity     the last 7 days, the study streak and a feed of recent sessions
 * Numbers come from progressCalc.js; flashcard and quiz data is read from where those features save it.
 */
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const when = (d) => new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const KIND = { quiz: [Target, 'green'], flashcards: [Layers, 'purple'], reviewer: [Sparkles, 'blue'] };
const PILL = { done: 'status-pill active', progress: 'status-pill pending', new: 'status-pill' };
const TABS = [['all', 'All'], ['done', 'Completed'], ['progress', 'In progress'], ['new', 'Not started']];

const Stat = ({ label, value, note, icon: I, tone = '' }) => <div className="stat-card"><div className={`stat-icon ${tone}`}><I size={18} /></div><div className="stat-copy"><span>{label}</span><strong>{value}</strong><small>{note}</small></div></div>;
const Bar = ({ pct, label }) => <div className="progress-track" role="progressbar" aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100" aria-label={label}><span style={{ width: pct + '%' }} /></div>;
const Hint = ({ children, action }) => <div className="sp-empty"><p className="muted">{children}</p>{action}</div>;

export default function StudyProgress() {
  const nav = useNavigate(); const pr = useStudyProgress(); const [tab, setTab] = useState('all'); const [reset, setReset] = useState(false);
  const { reviewers: rv, decks: dk, quizzes: qz, streak, week, events } = pr;
  const rows = rv.rows.filter((r) => tab === 'all' || r.status === tab);
  const counts = { all: rv.total, done: rv.done, progress: rv.progress, new: rv.fresh };
  const peak = Math.max(1, ...week.map((d) => d.count)); const weekTotal = week.reduce((t, d) => t + d.count, 0); const weekSecs = week.reduce((t, d) => t + d.secs, 0);
  const toggle = (r, done) => { track.setReviewerDone(r, done); toast(done ? 'Reviewer marked as completed' : 'Marked as not completed'); };
  const confirmReset = () => { pr.log.reset(); setReset(false); logEvent('Study progress log reset'); toast('Study log reset'); };

  return <>
    <SectionTitle title="Study Progress" subtitle="Track your reviewers, flashcards, quizzes and study activity in one place."
      action={<Button variant="outline" icon={RotateCcw} onClick={() => setReset(true)}>Reset study log</Button>} />

    <div className="stats-grid">
      <Stat label="Reviewers completed" value={`${rv.done} of ${rv.total}`} note={rv.total ? `${rv.pct}% of your reviewers` : 'No reviewers yet'} icon={Sparkles} />
      <Stat label="Cards mastered" value={`${dk.known} of ${dk.cards}`} note={dk.cards ? `${dk.pct}% mastery · ${plural(dk.mastered, 'deck')} complete` : 'No flashcards yet'} icon={CheckCircle2} tone="green" />
      <Stat label="Quiz average" value={qz.avg === null ? '–' : qz.avg + '%'} note={qz.taken ? `${plural(qz.taken, 'quiz attempt')} · best ${qz.best}%` : 'No quizzes taken yet'} icon={Target} tone="purple" />
      <Stat label="Study streak" value={plural(streak.current, 'day')} note={`Best ${plural(streak.best, 'day')} · ${fmtTime(pr.secs) || '0m'} studied`} icon={Flame} tone="orange" />
    </div>

    <div className="dashboard-grid sp-top">
      <section className="panel"><div className="list-head"><h3>Last 7 days</h3><span className="muted-sm">{weekTotal ? `${plural(weekTotal, 'activity')}${weekSecs ? ` · ${fmtTime(weekSecs)}` : ''}` : 'No activity yet'}</span></div>
        <div className="bar-chart" role="img" aria-label={`Study activity over the last 7 days: ${week.map((d) => `${d.key} ${plural(d.count, 'activity')}`).join(', ')}`}>
          {week.map((d) => <div className="bar-column" key={d.key} title={`${d.key}: ${plural(d.count, 'activity')}`}><div className="bar-bg"><span style={{ height: d.count ? Math.max(8, (d.count / peak) * 100) + '%' : 0 }} /></div><small className={d.today ? 'sp-today' : ''}>{d.label}</small></div>)}
        </div>
        <p className="muted sp-note">Counts flashcard sessions, quiz attempts and completed reviewers.</p></section>
      <section className="panel"><div className="list-head"><h3>Recent activity</h3></div>
        {events.length === 0 ? <Hint action={<Button variant="soft" icon={Layers} onClick={() => nav('/flashcards')}>Study flashcards</Button>}>Finish a flashcard session, a quiz or a reviewer and it will show up here.</Hint> :
          events.slice(0, 6).map((e) => { const [I, tone] = KIND[e.kind]; return <div className="generic-row" key={e.id}><div className={`activity-dot ${tone}`}><I size={16} /></div><div><b>{e.title}</b><small>{e.detail} · {when(e.date)}</small></div><Link className="link-btn" to={e.to} aria-label={`Open ${e.title}`}><ArrowUpRight size={16} /></Link></div>; })}</section>
    </div>

    <section className="panel list-panel sp-section"><div className="list-head"><h3>Reviewers</h3><Link className="link-btn" to="/reviewers" viewTransition>Manage reviewers <ArrowUpRight size={16} /></Link></div>
      {rv.total > 0 && <>
        <Bar pct={rv.pct} label="Reviewers completed" />
        <div className="tabs sp-tabs" role="group" aria-label="Filter reviewers">{TABS.map(([k, l]) => <button type="button" key={k} className={tab === k ? 'active' : ''} aria-pressed={tab === k} onClick={() => setTab(k)}>{l} ({counts[k]})</button>)}</div></>}
      {rv.total === 0 ? <Hint action={<Button icon={Sparkles} onClick={() => nav('/reviewers/create')}>Create a reviewer</Button>}>Create a reviewer from your materials, then mark it completed when you have studied it.</Hint> :
        rows.length === 0 ? <Hint>No reviewers in this group.</Hint> :
          rows.map(({ reviewer: r, rec, status }) => <div className="generic-row" key={r.id}>
            <div className={`activity-dot ${status === 'done' ? 'green' : status === 'progress' ? 'orange' : ''}`}>{status === 'done' ? <Check size={16} /> : <Sparkles size={16} />}</div>
            <div><b>{r.title}</b><small>{status === 'done' && rec.doneAt ? `Completed ${fmtDate(rec.doneAt)}` : status === 'progress' ? `Opened ${plural(rec.opened, 'time')}` : `${r.style} · not opened yet`}</small></div>
            <span className={PILL[status]}>{REVIEWER_LABELS[status]}</span>
            <button type="button" className="link-btn" onClick={() => toggle(r, status !== 'done')} aria-label={`${status === 'done' ? 'Mark as not completed' : 'Mark as completed'}: ${r.title}`}>{status === 'done' ? <><Undo2 size={14} /> Undo</> : <><Check size={14} /> Complete</>}</button>
            <Link className="link-btn" to={'/reviewers/' + r.id} aria-label={`Open ${r.title}`}>Open <ArrowUpRight size={16} /></Link></div>)}</section>

    <div className="dashboard-grid sp-section">
      <section className="panel list-panel"><div className="list-head"><h3>Flashcards</h3><Link className="link-btn" to="/flashcards" viewTransition>All decks <ArrowUpRight size={16} /></Link></div>
        {dk.rows.length === 0 ? <Hint action={<Button icon={Layers} onClick={() => nav('/flashcards')}>Create a deck</Button>}>Create a deck and mark cards as known while you study.</Hint> :
          dk.rows.map(({ deck: d, known, pct, last }) => <div className="sp-item" key={d.id}>
            <div className="deck-bottom"><b>{d.title}</b><span>{known} of {d.cards.length} known · {pct}%</span></div>
            <Bar pct={pct} label={`${d.title} mastery`} />
            <div className="deck-bottom"><span>{last ? `Last studied ${when(last.date)}` : 'Not studied yet'}</span>{d.cards.length > 0 && <Link className="link-btn" to={`/flashcards/${d.id}/study`}>Study <ArrowUpRight size={14} /></Link>}</div></div>)}</section>
      <section className="panel list-panel"><div className="list-head"><h3>Quizzes</h3><Link className="link-btn" to="/quizzes/attempts" viewTransition>Full history <ArrowUpRight size={16} /></Link></div>
        {qz.quizzes.length === 0 ? <Hint action={<Button icon={BookOpen} onClick={() => nav('/quizzes/create')}>Take a quiz</Button>}>Your scores for each quiz will be tracked here.</Hint> :
          qz.quizzes.slice(0, 6).map((q) => <div className="sp-item" key={q.key}>
            <div className="deck-bottom"><b>{q.title}</b><span>{plural(q.count, 'attempt')}</span></div>
            <Bar pct={q.latest} label={`${q.title} latest score`} />
            <div className="deck-bottom"><span>Latest {q.latest}% · Best {q.best}% · Avg {q.avg}%{q.delta !== null && <em className={`sp-delta ${q.delta > 0 ? 'up' : q.delta < 0 ? 'down' : ''}`}> {q.delta > 0 ? <TrendingUp size={13} /> : q.delta < 0 ? <TrendingDown size={13} /> : null}{q.delta === 0 ? 'No change' : `${q.delta > 0 ? '+' : '\u2212'}${Math.abs(q.delta)} pts`}</em>}</span>
              <Link className="link-btn" to={'/quizzes/attempts/' + q.latestId}>Review <ArrowUpRight size={14} /></Link></div></div>)}</section>
    </div>
    <p className="muted sp-foot"><Clock3 size={14} /> Progress is saved in this browser. Flashcard mastery and quiz history are managed on their own pages.</p>
    {reset && <ConfirmDialog icon={RotateCcw} title="Reset your study log?" body="This clears which reviewers you completed and your flashcard session history. Flashcard mastery and quiz attempts are not changed." confirmLabel="Reset" onCancel={() => setReset(false)} onConfirm={confirmReset} />}
  </>;
}
