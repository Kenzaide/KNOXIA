/**
 * Study progress (Patch 15): where progress is saved, and the hooks the screens use.
 *
 * Saved under `knoxia-progress` (per account) as { reviewers: { [id]: record }, sessions: [...] }; see progressCalc.js.
 * Flashcard mastery and quiz attempts are NOT copied here. They already have their own storage, and
 * `useStudyProgress` reads them from there, so the numbers can never disagree with the screens that own them.
 *
 * The `track` helpers write straight to storage (like `pushLS`), so they also work from an unmount cleanup.
 * FRONTEND-ONLY DEMO: a backend would own this data later.
 */
import { useMemo } from 'react';
import { userData, useUserData } from './storage.js';
import { useAttempts } from './data.js';
import { useReviewerLibrary } from './reviewerLib.js';
import { useDeckLibrary, uid } from './flashcards.js';
import { MAX_SESSIONS, buildProgress } from './progressCalc.js';

export const KEY = 'knoxia-progress';
const EMPTY = { reviewers: {}, sessions: [] };

/** Old or damaged saved data is read as a complete, empty record. */
const clean = (p) => ({
  reviewers: p && p.reviewers && typeof p.reviewers === 'object' && !Array.isArray(p.reviewers) ? p.reviewers : {},
  sessions: p && Array.isArray(p.sessions) ? p.sessions.filter((s) => s && typeof s === 'object') : [],
});
const write = (fn) => userData.update(KEY, (p) => fn(clean(p)), EMPTY);

export const track = {
  /** Counts one visit to a reviewer. The first visit moves it from "Not started" to "In progress". */
  openReviewer(id) {
    if (!id) return;
    write((p) => { const r = p.reviewers[id] || {}; return { ...p, reviewers: { ...p.reviewers, [id]: { ...r, opened: (r.opened || 0) + 1, lastOpened: new Date().toISOString() } } }; });
  },
  /** Marks a reviewer completed or not. Completing it is also logged as study activity (once per completion). */
  setReviewerDone(reviewer, done) {
    if (!reviewer || !reviewer.id) return;
    write((p) => {
      const r = p.reviewers[reviewer.id] || {}; const now = new Date().toISOString();
      const next = { ...p, reviewers: { ...p.reviewers, [reviewer.id]: done ? { ...r, opened: Math.max(1, r.opened || 0), done: true, doneAt: now } : { ...r, done: false, doneAt: '' } } };
      if (done && !r.done) next.sessions = [{ id: uid(), kind: 'reviewer', refId: reviewer.id, title: String(reviewer.title || 'Reviewer').slice(0, 120), date: now }, ...p.sessions].slice(0, MAX_SESSIONS);
      return next;
    });
  },
  /** Drops the progress record of deleted reviewers. Past activity stays in the log. */
  forgetReviewers(ids) {
    const gone = [].concat(ids).filter(Boolean); if (!gone.length) return;
    write((p) => { const reviewers = { ...p.reviewers }; gone.forEach((id) => { delete reviewers[id]; }); return { ...p, reviewers }; });
  },
  /** Logs one flashcard study session: `total` cards were rated and `correct` of them were known. */
  flashcards({ deckId, title, total, correct, secs }) {
    if (!deckId || !(total > 0)) return;
    write((p) => ({ ...p, sessions: [{ id: uid(), kind: 'flashcards', refId: deckId, title: String(title || 'Flashcard deck').slice(0, 120), date: new Date().toISOString(), secs: Math.max(0, Math.round(secs || 0)), total, correct: Math.max(0, Math.min(total, correct || 0)) }, ...p.sessions].slice(0, MAX_SESSIONS) }));
  },
};

/** The saved progress record and the one change that is not a `track` call: clearing it. */
export function useProgressLog() {
  const [raw] = useUserData(KEY, EMPTY); const p = useMemo(() => clean(raw), [raw]);
  return useMemo(() => ({ ...p, reset: () => userData.set(KEY, EMPTY) }), [p]);
}

/** All study progress, computed from the progress record, the decks and the quiz attempts. */
export function useStudyProgress() {
  const log = useProgressLog(); const { items: reviewers } = useReviewerLibrary(); const { decks } = useDeckLibrary(); const [attempts] = useAttempts();
  const today = new Date().toDateString(); // recompute when the day changes
  const data = useMemo(() => buildProgress({ reviewers, records: log.reviewers, sessions: log.sessions, decks, attempts }), [reviewers, log, decks, attempts, today]); // eslint-disable-line react-hooks/exhaustive-deps
  // `decks` and `reviewers` are the summaries from progressCalc.js; the raw saved lists come back as `deckList` and `reviewerList`.
  return { ...data, log, deckList: decks, reviewerList: reviewers };
}
