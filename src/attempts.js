/**
 * Quiz attempts (Patches 13 and 14): how a finished attempt is graded and compared, and `useAttemptHistory`,
 * the one place that deletes saved attempts. Used by the quiz runner, the results page and the history page.
 *
 * An attempt is saved as
 *   { id, n, ans, score, date, quizId, title, questions, secs?, kind?, fromAttempt? }
 *   ans            the chosen option index for each question, or null when the question was left unanswered
 *   questions      a copy of the questions it was graded against, so results stay correct if the quiz is edited later
 *   secs           seconds spent on the quiz (attempts saved before Patch 13 have none)
 *   kind           'missed' for a retake of earlier missed questions; `fromAttempt` is the attempt they came from
 * Attempts saved before Patch 12 have no `questions` (they used the first `n` sample questions) and no `quizId`.
 */
import { useMemo } from 'react';
import { BANK, useAttempts } from './data.js';

export const LETTERS = 'ABCD';
export const MISSED_SUFFIX = ' (missed questions)';

/** True or false questions always have these two options. */
export const isTF = (options) => Array.isArray(options) && options.length === 2 && options[0] === 'True' && options[1] === 'False';

/** 75 -> "1 min 15 sec", 3700 -> "1 hr 1 min". Returns '' when the time was not recorded. */
export function fmtDuration(secs) {
  if (typeof secs !== 'number' || !Number.isFinite(secs) || secs < 0) return '';
  const s = Math.round(secs);
  if (s < 60) return `${s} sec`;
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 && m < 10 ? `${m} min ${s % 60} sec` : `${m} min`;
  return m % 60 ? `${Math.floor(m / 60)} hr ${m % 60} min` : `${Math.floor(m / 60)} hr`;
}
/** 75 -> "01:15", for the running clock. */
export const fmtClock = (secs) => `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;

const legacyQuestions = (n) => BANK.slice(0, Math.max(0, Math.min(Number(n) || 0, BANK.length)))
  .map(([q, options, answer, explanation], i) => ({ id: `b${i}`, type: 'mcq', q, options, answer, explanation }));

/**
 * Grades an attempt from its saved answers and questions (never from the stored score alone, so the page can
 * not disagree with itself). Missing, out-of-range or malformed answers count as unanswered.
 * @returns {{ items: object[], n: number, correct: number, wrong: number, skipped: number, pct: number }}
 *   each item is { index, question, q, options, right, picked, explanation, status: 'correct'|'wrong'|'skipped' }
 */
export function gradeAttempt(a) {
  const saved = Array.isArray(a.questions) ? a.questions.filter((q) => q && Array.isArray(q.options) && q.options.length) : [];
  const questions = saved.length ? saved : legacyQuestions(a.n);
  const ans = Array.isArray(a.ans) ? a.ans : [];
  const items = questions.map((question, index) => {
    const raw = ans[index];
    const picked = Number.isInteger(raw) && raw >= 0 && raw < question.options.length ? raw : null;
    return {
      index, question, q: question.q, options: question.options, right: question.answer, picked, explanation: question.explanation || '',
      status: picked === null ? 'skipped' : picked === question.answer ? 'correct' : 'wrong',
    };
  });
  const count = (s) => items.filter((x) => x.status === s).length;
  const n = items.length; const correct = count('correct');
  return { items, n, correct, wrong: count('wrong'), skipped: count('skipped'), pct: n ? Math.round((correct / n) * 100) : 0 };
}

/** The percentage stored with an attempt. Cheap, for lists; the results page grades the attempt itself. */
export const pctOf = (a) => (a.n > 0 ? Math.max(0, Math.min(100, Math.round((a.score / a.n) * 100))) : 0);
export const timeOf = (a) => { const t = new Date(a.date).getTime(); return Number.isFinite(t) ? t : 0; };
export const attemptTitle = (a) => a.title || 'Practice quiz';

/** True when both attempts are of the same quiz, so their scores can be compared. */
export function sameQuiz(a, b) {
  if (a.kind === 'missed' || b.kind === 'missed') return a.kind === b.kind && !!a.fromAttempt && a.fromAttempt === b.fromAttempt;
  if (a.quizId || b.quizId) return a.quizId === b.quizId;
  return attemptTitle(a) === attemptTitle(b) && a.n === b.n; // sample-quiz attempts from before Patch 12
}

/** The saved attempts and the changes to them. Attempts are added by the quiz screens through `pushLS`. */
export function useAttemptHistory() {
  const [saved, setSaved] = useAttempts();
  return useMemo(() => ({
    items: saved.filter((a) => a && typeof a === 'object' && a.id),
    remove: (id) => setSaved((list) => list.filter((x) => x && x.id !== id)),
    clear: () => setSaved([]),
  }), [saved, setSaved]);
}
