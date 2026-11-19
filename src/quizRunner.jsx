import React, { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardCheck, Clock3, Flag } from 'lucide-react';
import { ConfirmDialog } from './ui.jsx';
import { LETTERS, fmtClock, isTF } from './attempts.js';

/**
 * The quiz-taking screen (Patch 13), shared by saved quizzes, missed-question retakes and Quiz Challenges.
 *
 *   - Pick an answer, change it, or clear it. Questions can be flagged to come back to.
 *   - Previous / Next, plus a numbered navigator that shows answered, flagged and current questions.
 *   - Progress bar and a running clock.
 *   - "Review & submit" lists every question with its state. Unanswered questions are allowed after a
 *     confirmation, and are marked incorrect.
 *   - Keyboard: A-D or 1-4 choose, left and right arrows move, F flags.
 *   - Leaving asks first when there are answers, and closing the tab warns too.
 *
 * `qs` is a list of [question, options, correct index, explanation]. `onFinish(answers, { secs, flagged })` gets the
 * chosen option index for each question, or null for a question left unanswered.
 * Nothing is saved until the quiz is submitted: leaving or reloading loses the answers.
 */
const KEYS = { a: 0, b: 1, c: 2, d: 3, 1: 0, 2: 1, 3: 2, 4: 3 };
const Btn = ({ children, v = 'primary', icon: I, ...p }) => <button type="button" className={`btn ${v}`} {...p}>{I && <I size={16} />}<span>{children}</span></button>;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

export function QuizRunner({ qs, label = 'QUIZ', exitTo = '/dashboard', onFinish, timeLimitSeconds = 0 }) {
  const nav = useNavigate(); const hid = useId(); const total = qs.length;
  const [i, setI] = useState(0); const [ans, setAns] = useState(() => qs.map(() => null)); const [flags, setFlags] = useState(() => qs.map(() => false));
  const [reviewing, setReviewing] = useState(false); const [dlg, setDlg] = useState(null); const [secs, setSecs] = useState(0);
  const latestAnswers = useRef(ans); latestAnswers.current = ans; const started = useRef(Date.now()); const finished = useRef(false); const reviewHead = useRef(null);
  const q = qs[i]; const last = i === total - 1;
  const answered = ans.filter((x) => x !== null).length; const unanswered = total - answered; const flagged = flags.filter(Boolean).length;

  useEffect(() => { const t = setInterval(() => setSecs(Math.floor((Date.now() - started.current) / 1000)), 1000); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (!timeLimitSeconds) return;
    const timer = setInterval(() => {
      if (!finished.current && Math.floor((Date.now() - started.current) / 1000) >= timeLimitSeconds) {
        finished.current = true;
        clearInterval(timer);
        onFinish(latestAnswers.current.slice(), {secs:timeLimitSeconds,flagged:0,timedOut:true});
      }
    }, 500);
    return () => clearInterval(timer);
  }, [timeLimitSeconds, onFinish]);
  // Closing or reloading the tab would lose the answers.
  useEffect(() => {
    if (!answered) return undefined;
    const warn = (e) => { if (!finished.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [answered > 0]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (reviewing && reviewHead.current) reviewHead.current.focus(); }, [reviewing]);

  const go = (k) => { setI(Math.max(0, Math.min(total - 1, k))); setReviewing(false); };
  const pick = (k) => setAns((a) => a.map((x, n) => (n === i ? k : x)));
  const flip = () => setFlags((f) => f.map((x, n) => (n === i ? !x : x)));
  const submit = () => {
    if (finished.current) return; finished.current = true; setDlg(null);
    onFinish(ans.slice(), { secs: Math.round((Date.now() - started.current) / 1000), flagged });
  };
  const leave = () => { if (answered) setDlg('exit'); else nav(exitTo); };

  useEffect(() => {
    if (reviewing || dlg) return undefined;
    const onKey = (e) => {
      if (e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      const key = e.key.toLowerCase(); let used = true;
      if (key in KEYS) { if (KEYS[key] < qs[i][1].length) pick(KEYS[key]); else used = false; }
      else if (key === 'arrowright') go(i + 1);
      else if (key === 'arrowleft') go(i - 1);
      else if (key === 'f') flip();
      else used = false;
      if (used) e.preventDefault();
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }); // re-bound on every render so it always sees the current question

  const stateOf = (k) => `${ans[k] === null ? 'not answered' : `answer ${LETTERS[ans[k]]}`}${flags[k] ? ', flagged' : ''}`;
  const top = <>
    <div className="quiz-top"><span className="post-tags"><span>{label}</span></span>
      <span className="qr-meta"><span className="muted">{answered} of {total} answered</span><span className="qr-time" aria-hidden="true"><Clock3 size={14} /> {fmtClock(secs)}</span></span></div>
    <div className="progress-track" role="progressbar" aria-label="Questions answered" aria-valuemin={0} aria-valuemax={total} aria-valuenow={answered}><span style={{ width: `${(answered / total) * 100}%` }} /></div>
    <div className="q-dots" role="group" aria-label="Question navigator">{qs.map((_, k) => <button type="button" key={k} aria-label={`Question ${k + 1}, ${stateOf(k)}`} aria-current={!reviewing && k === i ? 'step' : undefined}
      className={`${ans[k] !== null ? 'done' : ''} ${flags[k] ? 'flag' : ''} ${!reviewing && k === i ? 'now' : ''}`} onClick={() => go(k)}>{k + 1}</button>)}</div></>;

  return <div className="quiz-wrap">{top}
    {reviewing ? <div className="panel qr-review">
      <h2 ref={reviewHead} tabIndex={-1}>Review your answers</h2>
      <p className="muted">{unanswered ? `${plural(unanswered, 'question')} ${unanswered === 1 ? 'has' : 'have'} no answer. Unanswered questions count as incorrect.` : 'You answered every question.'}{flagged ? ` ${plural(flagged, 'question')} flagged for review.` : ''}</p>
      <ul className="qr-list">{qs.map((x, k) => <li key={k}><button type="button" onClick={() => go(k)} aria-label={`Go to question ${k + 1}: ${x[0]}. ${stateOf(k)}`}>
        <span className="qr-n">{k + 1}</span><span className="qr-q">{x[0]}</span>
        <span className={`qr-state ${ans[k] === null ? 'skip' : 'ok'}`}>{flags[k] && <Flag size={13} aria-hidden="true" />}{ans[k] === null ? 'Not answered' : `Answer ${LETTERS[ans[k]]}`}</span></button></li>)}</ul>
      <div className="quiz-nav"><Btn v="outline" onClick={() => go(i)}>Back to quiz</Btn><Btn icon={ClipboardCheck} onClick={() => (unanswered ? setDlg('submit') : submit())}>Submit quiz</Btn></div>
    </div> : <>
      <p className="qr-sr" role="status" aria-live="polite">Question {i + 1} of {total}. {ans[i] === null ? 'Not answered yet.' : `Answer ${LETTERS[ans[i]]} selected.`}{flags[i] ? ' Flagged for review.' : ''}</p>
      <div className="panel quiz-card">
        <div className="qr-card-top"><small>Question {i + 1} of {total} · {isTF(q[1]) ? 'True or false' : 'Multiple choice'}</small>
          <button type="button" className={`qr-flag${flags[i] ? ' on' : ''}`} aria-pressed={flags[i]} onClick={flip}><Flag size={14} aria-hidden="true" /> {flags[i] ? 'Flagged' : 'Flag for review'}</button></div>
        <h2 id={hid}>{q[0]}</h2>
        <div role="group" aria-labelledby={hid}>{q[1].map((o, k) => <button type="button" key={k} className={`answer-option${ans[i] === k ? ' picked' : ''}`} aria-pressed={ans[i] === k} onClick={() => pick(k)}><span>{LETTERS[k]}</span>{o}</button>)}</div>
        {ans[i] !== null && <button type="button" className="link-btn qr-clear" onClick={() => pick(null)}>Clear answer</button>}
        <p className="qr-hint">Shortcuts: <kbd>A</kbd>–<kbd>{LETTERS[Math.min(q[1].length, 4) - 1]}</kbd> choose · <kbd>←</kbd> <kbd>→</kbd> move · <kbd>F</kbd> flag</p>
      </div>
      <div className="quiz-nav"><Btn v="outline" disabled={i === 0} onClick={() => go(i - 1)}>Previous</Btn>
        <span className="muted">{unanswered ? `${unanswered} left to answer` : 'All answered'}</span>
        {last ? <Btn icon={ClipboardCheck} onClick={() => setReviewing(true)}>Review &amp; submit</Btn> : <Btn onClick={() => go(i + 1)}>Next</Btn>}</div>
      <div className="qr-foot">{!last && <button type="button" className="link-btn" onClick={() => setReviewing(true)}>Review &amp; submit</button>}<button type="button" className="link-btn" onClick={leave}>Exit quiz</button></div></>}
    {reviewing && <div className="qr-foot"><button type="button" className="link-btn" onClick={leave}>Exit quiz</button></div>}
    {dlg === 'exit' && <ConfirmDialog title="Leave this quiz?" body={`You have answered ${answered} of ${total} questions. Your answers will be lost.`} confirmLabel="Leave quiz" onCancel={() => setDlg(null)} onConfirm={() => { finished.current = true; nav(exitTo); }} />}
    {dlg === 'submit' && <ConfirmDialog icon={ClipboardCheck} title="Submit with unanswered questions?" body={`${plural(unanswered, 'question')} ${unanswered === 1 ? 'is' : 'are'} not answered and will count as incorrect. You can go back and answer ${unanswered === 1 ? 'it' : 'them'} first.`} confirmLabel="Submit anyway" onCancel={() => setDlg(null)} onConfirm={submit} />}
  </div>;
}
