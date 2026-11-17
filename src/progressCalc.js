/**
 * Study progress (Patch 15): the rules for turning what a student has done into numbers.
 * Everything here is a pure function of the saved data (no React, no storage), so it is easy to test.
 *
 * What is tracked, and where it comes from:
 *   reviewers   progress.reviewers[id] = { opened, lastOpened, done, doneAt }   (written by the reviewer editor)
 *   flashcards  each card's `known` flag (flashcards.js) + one log entry per study session
 *   quizzes     the saved attempts (attempts.js). They are read as they are; nothing is copied.
 *   activity    progress.sessions = [{ id, kind: 'flashcards' | 'reviewer', refId, title, date, secs, total, correct }]
 *
 * A "study day" is a local calendar day with at least one flashcard session, quiz attempt or reviewer completed.
 * Opening a reviewer is tracked (it becomes "In progress") but does not count as study activity on its own.
 *
 * FRONTEND-ONLY DEMO: like everything else, this lives in this browser (progressStore.js).
 */

export const DAY = 86400000;
export const MAX_SESSIONS = 500;

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const time = (d) => { const t = new Date(d).getTime(); return Number.isFinite(t) ? t : 0; };

/** Local calendar day of a date as 'YYYY-MM-DD', or '' for a missing or invalid date. */
export function dayKey(d) {
  const t = d instanceof Date ? d : new Date(d); if (Number.isNaN(t.getTime())) return '';
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}
/** Moves a 'YYYY-MM-DD' day by `n` days. Uses noon so daylight-saving changes never skip or repeat a day. */
export function shiftDay(key, n) { const [y, m, d] = key.split('-').map(Number); return dayKey(new Date(y, m - 1, d + n, 12)); }

/** 75 -> "1m", 3700 -> "1h 1m", 40 -> "40s". Empty string when there is nothing to show. */
export function fmtTime(secs) {
  const s = Math.round(num(secs)); if (s <= 0) return '';
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60); if (m < 60) return `${m}m`;
  return m % 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${Math.floor(m / 60)}h`;
}

/* ---------- quizzes ---------- */
/** The percentage of an attempt, from its saved score and question count. */
export const attemptPct = (a) => (a && a.n > 0 ? Math.max(0, Math.min(100, Math.round((a.score / a.n) * 100))) : 0);
/** Missed-question retakes are practice on part of a quiz: they stay in the history but not in the averages. */
export const isFullAttempt = (a) => !!a && typeof a === 'object' && !!a.id && a.kind !== 'missed';

/**
 * Per-quiz summary of the saved attempts, newest quiz first.
 * Attempts are grouped by `quizId` (older ones, with none, by title). `delta` is the latest score minus the one before it.
 */
export function quizSummary(attempts) {
  const full = (Array.isArray(attempts) ? attempts : []).filter(isFullAttempt).sort((a, b) => time(a.date) - time(b.date));
  const groups = new Map();
  full.forEach((a) => { const key = a.quizId || `title:${a.title || 'Practice quiz'}`; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(a); });
  const quizzes = [...groups.entries()].map(([key, list]) => {
    const pcts = list.map(attemptPct); const latest = list[list.length - 1];
    return {
      key, quizId: latest.quizId || '', title: latest.title || 'Practice quiz', count: list.length,
      best: Math.max(...pcts), latest: pcts[pcts.length - 1], avg: Math.round(pcts.reduce((s, p) => s + p, 0) / pcts.length),
      delta: pcts.length > 1 ? pcts[pcts.length - 1] - pcts[pcts.length - 2] : null, latestId: latest.id, lastDate: latest.date,
    };
  }).sort((a, b) => time(b.lastDate) - time(a.lastDate));
  const all = full.map(attemptPct);
  return { quizzes, taken: full.length, avg: all.length ? Math.round(all.reduce((s, p) => s + p, 0) / all.length) : null, best: all.length ? Math.max(...all) : null };
}

/* ---------- reviewers ---------- */
/** 'done' | 'progress' | 'new', from one reviewer's progress record (missing-safe). */
export function reviewerStatus(rec) {
  if (rec && rec.done) return 'done';
  return rec && num(rec.opened) > 0 ? 'progress' : 'new';
}
export const REVIEWER_LABELS = { done: 'Completed', progress: 'In progress', new: 'Not started' };

/** Counts over the reviewers that still exist. Records for deleted reviewers are ignored. */
export function reviewerSummary(reviewers, records) {
  const map = records && typeof records === 'object' ? records : {};
  const rows = (Array.isArray(reviewers) ? reviewers : []).map((r) => ({ reviewer: r, rec: map[r.id] || null, status: reviewerStatus(map[r.id]) }));
  const count = (s) => rows.filter((x) => x.status === s).length;
  return { rows, total: rows.length, done: count('done'), progress: count('progress'), fresh: count('new'), pct: rows.length ? Math.round((count('done') / rows.length) * 100) : 0 };
}

/* ---------- flashcards ---------- */
export const deckKnown = (d) => (Array.isArray(d.cards) ? d.cards.filter((c) => c.known).length : 0);
export const deckPct = (d) => (Array.isArray(d.cards) && d.cards.length ? Math.round((deckKnown(d) / d.cards.length) * 100) : 0);

/** Totals across all decks, plus the most recent study session of each deck. */
export function deckSummary(decks, sessions) {
  const list = Array.isArray(decks) ? decks : [];
  const cards = list.reduce((t, d) => t + (d.cards || []).length, 0); const known = list.reduce((t, d) => t + deckKnown(d), 0);
  const last = new Map();
  (Array.isArray(sessions) ? sessions : []).filter((s) => s && s.kind === 'flashcards').forEach((s) => { if (time(s.date) > time((last.get(s.refId) || {}).date)) last.set(s.refId, s); });
  return {
    cards, known, pct: cards ? Math.round((known / cards) * 100) : 0, mastered: list.filter((d) => (d.cards || []).length && deckKnown(d) === d.cards.length).length,
    rows: list.map((d) => ({ deck: d, known: deckKnown(d), pct: deckPct(d), last: last.get(d.id) || null })),
  };
}

/** Mastery per subject: the share of known cards across the decks of that subject. Subjects with no cards are left out. */
export function topicMastery(decks) {
  const map = new Map();
  (Array.isArray(decks) ? decks : []).forEach((d) => {
    const name = d.subject || 'No subject'; const e = map.get(name) || { name, cards: 0, known: 0 };
    e.cards += (d.cards || []).length; e.known += deckKnown(d); map.set(name, e);
  });
  return [...map.values()].filter((e) => e.cards > 0).map((e) => ({ name: e.name, pct: Math.round((e.known / e.cards) * 100) })).sort((a, b) => b.pct - a.pct);
}

/* ---------- activity ---------- */
/**
 * Everything the student did, as one list, newest first. Each event is
 * { id, kind: 'flashcards' | 'reviewer' | 'quiz', title, detail, date, secs, to }.
 */
export function activityEvents(sessions, attempts) {
  const out = [];
  (Array.isArray(sessions) ? sessions : []).forEach((s) => {
    if (!s || !time(s.date)) return;
    if (s.kind === 'flashcards') out.push({ id: `s${s.id}`, kind: 'flashcards', title: s.title || 'Flashcard deck', date: s.date, secs: num(s.secs), to: s.refId ? `/flashcards/${s.refId}/study` : '/flashcards',
      detail: s.total ? `Knew ${num(s.correct)} of ${s.total} cards` : 'Studied cards' });
    else if (s.kind === 'reviewer') out.push({ id: `s${s.id}`, kind: 'reviewer', title: s.title || 'Reviewer', date: s.date, secs: 0, to: s.refId ? `/reviewers/${s.refId}` : '/reviewers', detail: 'Marked as completed' });
  });
  (Array.isArray(attempts) ? attempts : []).forEach((a) => {
    if (!a || typeof a !== 'object' || !a.id || !time(a.date)) return;
    out.push({ id: `a${a.id}`, kind: 'quiz', title: a.title || 'Practice quiz', date: a.date, secs: num(a.secs), to: `/quizzes/attempts/${a.id}`,
      detail: `${attemptPct(a)}% · ${num(a.score)} of ${num(a.n)} correct${a.kind === 'missed' ? ' (missed questions)' : ''}` });
  });
  return out.sort((a, b) => time(b.date) - time(a.date));
}

export const studySeconds = (events) => events.reduce((t, e) => t + num(e.secs), 0);

/**
 * The current streak and the best streak, in days. The current streak is still alive when the student has not
 * studied yet today but did yesterday, so it only drops to 0 after a full day is missed.
 */
export function streaks(events, now = new Date()) {
  const days = new Set(events.map((e) => dayKey(e.date)).filter(Boolean)); if (!days.size) return { current: 0, best: 0, days: 0 };
  const today = dayKey(now); let cursor = days.has(today) ? today : shiftDay(today, -1); let current = 0;
  while (days.has(cursor)) { current++; cursor = shiftDay(cursor, -1); }
  const sorted = [...days].sort(); let best = 0; let run = 0; let prev = '';
  sorted.forEach((k) => { run = prev && shiftDay(prev, 1) === k ? run + 1 : 1; best = Math.max(best, run); prev = k; });
  return { current, best, days: days.size };
}

/** The last `n` days ending today, oldest first: { key, label, count, secs, today }. */
export function lastDays(events, now = new Date(), n = 7) {
  const today = dayKey(now); const by = new Map();
  events.forEach((e) => { const k = dayKey(e.date); if (!k) return; const x = by.get(k) || { count: 0, secs: 0 }; x.count++; x.secs += num(e.secs); by.set(k, x); });
  return Array.from({ length: n }, (_, i) => {
    const key = shiftDay(today, i - (n - 1)); const [y, m, d] = key.split('-').map(Number); const x = by.get(key) || { count: 0, secs: 0 };
    return { key, label: new Date(y, m - 1, d, 12).toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1), count: x.count, secs: x.secs, today: key === today };
  });
}

/** Everything the progress screens need, from the raw saved data. */
export function buildProgress({ reviewers, records, sessions, decks, attempts }, now = new Date()) {
  const events = activityEvents(sessions, attempts);
  return {
    reviewers: reviewerSummary(reviewers, records), decks: deckSummary(decks, sessions), quizzes: quizSummary(attempts),
    events, secs: studySeconds(events), streak: streaks(events, now), week: lastDays(events, now), hasActivity: events.length > 0,
  };
}
