/**
 * Group study activities screens (Patch 22): the "Group activities" panel inside a study room (shared study
 * sessions, group quizzes, shared goal lists) and the screen where a member takes a group quiz.
 * Rules are in activitiesCalc.js, storage and hooks in activitiesStore.js.
 */
import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Timer, ClipboardCheck, ListChecks, Trash2, Trophy, Plus, Users } from 'lucide-react';
import { UserAvatar } from './profile.jsx';
import { Button, PageSkeleton } from './ui.jsx';
import { QuizRunner } from './quizRunner.jsx';
import { toast } from './materials.jsx';
import { fmtClock, fmtDuration } from './attempts.js';
import { useQuizLibrary, sampleQuestions, toTuple } from './quizzes.js';
import { isMember, isOwner } from './roomsCalc.js';
import { useRoomsData } from './roomsStore.js';
import {
  SESSION_MINUTES, MAX_TITLE, MAX_GOAL, MAX_GOALS, isActive, secondsLeft, leaderboard, goalProgress,
} from './activitiesCalc.js';
import {
  useRoomActivities, startStudySession, joinStudySession, leaveStudySession, shareGroupQuiz, submitGroupQuiz,
  startGoalList, addGroupGoal, toggleGroupGoal, removeActivity,
} from './activitiesStore.js';

const run = (out, okMsg) => { if (out.error) toast(out.error); else if (okMsg) toast(okMsg); return !out.error; };
const nameOf = (data, id) => (id === data.meId ? 'You' : (data.people.get(id) || {}).displayName || 'Former member');
const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** The current time, ticking every second while `on` (used for the session countdown). */
function useNow(on) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!on) return undefined; setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [on]);
  return now;
}

function Card({ icon: I, tone, title, meta, data, room, a, children }) {
  const canRemove = a.createdBy === data.meId || isOwner(room, data.meId);
  return <div className="panel act-card">
    <div className="act-head"><div className={`activity-dot ${tone}`}><I size={16} /></div>
      <div><b>{title}</b><small>{meta} · started by {nameOf(data, a.createdBy)}</small></div>
      {canRemove && <button type="button" className="link-btn" aria-label={`Remove ${title}`} onClick={() => run(removeActivity(data.me, a.id), 'Activity removed')}><Trash2 size={15} /></button>}
    </div>
    {children}
  </div>;
}

function SessionCard({ a, room, data }) {
  const active = isActive(a); const now = useNow(active); const left = secondsLeft(a, now); const live = active && left > 0;
  const joined = a.joinedIds.includes(data.meId);
  return <Card icon={Timer} tone="orange" title={a.title} meta={`${a.minutes}-minute session`} data={data} room={room} a={a}>
    {live ? <div className="act-timer" role="timer" aria-label="Time left in the shared session">{fmtClock(left)}</div> : <p className="muted-sm">Session ended. {count(a.joinedIds.length, 'person', 'people')} studied together.</p>}
    <div className="act-people">{a.joinedIds.map((id) => { const p = data.people.get(id); return p ? <span key={id} className="act-chip"><UserAvatar profile={p} size="xs" />{id === data.meId ? 'You' : p.displayName}</span> : null; })}</div>
    {live && (joined
      ? <Button variant="outline" onClick={() => run(leaveStudySession(data.me, a.id), 'You left the session')}>Leave session</Button>
      : <Button onClick={() => run(joinStudySession(data.me, a.id), 'You joined the session')}>Join session</Button>)}
  </Card>;
}

function QuizCard({ a, room, data }) {
  const board = leaderboard(a); const mine = board.find((r) => r.userId === data.meId);
  return <Card icon={ClipboardCheck} tone="blue" title={a.title} meta={`Group quiz · ${count(a.questions.length, 'question', 'questions')}`} data={data} room={room} a={a}>
    {board.length === 0 ? <p className="muted-sm">No one has taken it yet.</p>
      : <ol className="act-board" aria-label="Quiz results">{board.map((r, i) => <li key={r.userId}><span className="act-rank">{i === 0 ? <Trophy size={14} /> : i + 1}</span>
        <span>{nameOf(data, r.userId)}</span><b>{r.score}/{r.n}</b><small>{fmtDuration(r.secs)}</small></li>)}</ol>}
    <Link className="btn primary" to={`/study-rooms/${room.id}/quiz/${a.id}`}>{mine ? 'Retake to beat your score' : 'Take the quiz'}</Link>
  </Card>;
}

function GoalsCard({ a, room, data }) {
  const [text, setText] = useState(''); const p = goalProgress(a);
  const add = (e) => { e.preventDefault(); if (run(addGroupGoal(data.me, a.id, text))) setText(''); };
  return <Card icon={ListChecks} tone="green" title={a.title} meta={`Shared goals · ${p.done} of ${p.total} done`} data={data} room={room} a={a}>
    <div className="progress-track" role="progressbar" aria-label="Goals completed" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p.pct}><span style={{ width: `${p.pct}%` }} /></div>
    <ul className="act-goals">{a.items.map((i) => <li key={i.id}><label><input type="checkbox" checked={!!i.doneBy} onChange={() => run(toggleGroupGoal(data.me, a.id, i.id))} />
      <span className={i.doneBy ? 'done' : ''}>{i.text}</span></label>{i.doneBy && <small>done by {nameOf(data, i.doneBy)}</small>}</li>)}</ul>
    {a.items.length < MAX_GOALS && <form className="act-add" onSubmit={add}><input aria-label="Add a goal" placeholder="Add a goal for the group" maxLength={MAX_GOAL} value={text} onChange={(e) => setText(e.target.value)} /><Button type="submit" variant="soft" icon={Plus}>Add</Button></form>}
  </Card>;
}

/** The creation form for one kind of activity. */
function Creator({ mode, room, data, onDone }) {
  const lib = useQuizLibrary(); const [title, setTitle] = useState(''); const [mins, setMins] = useState(SESSION_MINUTES[1]); const [src, setSrc] = useState('sample');
  const submit = (e) => {
    e.preventDefault(); let out;
    if (mode === 'session') out = startStudySession(data.me, room.id, { title, minutes: mins });
    else if (mode === 'goals') out = startGoalList(data.me, room.id, title);
    else {
      const quiz = lib.items.find((q) => q.id === src);
      out = shareGroupQuiz(data.me, room.id, quiz ? { title: title || quiz.title, questions: quiz.questions.map(toTuple) } : { title: title || 'Sample quiz', questions: sampleQuestions(5).map(toTuple) });
    }
    if (run(out, mode === 'session' ? 'Session started' : mode === 'quiz' ? 'Quiz shared with the room' : 'Goal list created')) onDone();
  };
  return <form className="panel room-form" onSubmit={submit}>
    {mode === 'quiz' && <select aria-label="Quiz to share" value={src} onChange={(e) => setSrc(e.target.value)}>
      <option value="sample">Sample quiz (5 questions)</option>{lib.items.filter((q) => q.questions.length).map((q) => <option key={q.id} value={q.id}>{q.title}</option>)}</select>}
    <input aria-label="Title (optional)" placeholder={mode === 'session' ? 'What will you study? (optional)' : 'Title (optional)'} maxLength={MAX_TITLE} value={title} onChange={(e) => setTitle(e.target.value)} />
    {mode === 'session' && <select aria-label="Session length" value={mins} onChange={(e) => setMins(Number(e.target.value))}>{SESSION_MINUTES.map((m) => <option key={m} value={m}>{m} minutes</option>)}</select>}
    <Button type="submit">{mode === 'session' ? 'Start session' : mode === 'quiz' ? 'Share quiz' : 'Create list'}</Button>
    <Button variant="outline" onClick={onDone}>Cancel</Button>
  </form>;
}

/** The "Group activities" panel, shown to members under a room's conversation. */
export function GroupActivities({ room, data }) {
  const list = useRoomActivities(room.id); const [mode, setMode] = useState(null);
  return <section className="act-section" aria-label="Group activities">
    <div className="section-title"><div><h2>Group activities</h2><p>Study together: share a timed session, quiz each other or tick off goals as a group.</p></div>
      <div className="act-actions"><Button variant="soft" icon={Timer} onClick={() => setMode('session')}>Study session</Button><Button variant="soft" icon={ClipboardCheck} onClick={() => setMode('quiz')}>Group quiz</Button><Button variant="soft" icon={ListChecks} onClick={() => setMode('goals')}>Goal list</Button></div></div>
    {mode && <Creator key={mode} mode={mode} room={room} data={data} onDone={() => setMode(null)} />}
    {list.length === 0 ? <div className="empty-state panel"><Users size={28} /><b>No group activities yet</b><p>Start a shared session, share a quiz or make a goal list for everyone in the room.</p></div>
      : <div className="act-grid">{list.map((a) => a.kind === 'session' ? <SessionCard key={a.id} a={a} room={room} data={data} />
        : a.kind === 'quiz' ? <QuizCard key={a.id} a={a} room={room} data={data} /> : <GoalsCard key={a.id} a={a} room={room} data={data} />)}</div>}
  </section>;
}

/** `/study-rooms/:id/quiz/:activityId`: a member takes the group quiz; the result goes on the room's board. */
export function GroupQuizPlay() {
  const { id, activityId } = useParams(); const nav = useNavigate(); const data = useRoomsData(); const list = useRoomActivities(id);
  if (!data.ready) return <PageSkeleton />;
  const room = data.rooms.find((r) => r.id === id); const a = list.find((x) => x.id === activityId && x.kind === 'quiz');
  const back = <Button onClick={() => nav(`/study-rooms/${id}`)}>Back to the room</Button>;
  if (!room || !a) return <div className="empty-state"><ClipboardCheck size={32} /><b>Quiz not found</b><p>It may have been removed.</p>{back}</div>;
  if (!isMember(room, data.meId)) return <div className="empty-state"><Users size={32} /><b>Join the room to take this quiz</b>{back}</div>;
  const finish = (answers, { secs }) => {
    const out = submitGroupQuiz(data.me, a.id, answers, secs);
    if (out.error) toast(out.error); else toast(`You scored ${out.result.score}/${out.result.n}${out.improved ? '' : ' (your best score is kept)'}`);
    nav(`/study-rooms/${id}`);
  };
  return <QuizRunner qs={a.questions} label={`GROUP QUIZ · ${a.title}`} exitTo={`/study-rooms/${id}`} onFinish={finish} />;
}
