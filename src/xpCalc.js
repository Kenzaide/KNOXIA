/**
 * XP and levels (Patch 23): the rules for turning learning activity into experience points and a level.
 *
 * Pure functions only: no storage, no React (tested by test/xpCalc.test.mjs). Hooks are in `src/gamificationStore.js`,
 * the screens in `src/gamification.jsx`.
 *
 * XP is worked out from what is already saved (quiz attempts, flashcard sessions, completed reviewers, group
 * activities, posts), so it never double counts and older activity earns XP too. Because of that, deleting
 * something (for example a quiz attempt) also removes the XP it gave. Each award is
 *   { id, kind, label, xp, date }   (date in ms)
 */
import { activityEvents, attemptPct, isFullAttempt, dayKey, DAY } from './progressCalc.js';

/** What each kind of activity is worth. */
export const XP_RULES = {
  quiz: { label: 'Quizzes', hint: '10 XP, plus up to 20 for your score' },
  missed: { label: 'Missed-question retakes', hint: '5 XP each' },
  flashcards: { label: 'Flashcard sessions', hint: '10 XP, plus 1 per card you knew (up to 20)' },
  reviewer: { label: 'Reviewers completed', hint: '15 XP each' },
  day: { label: 'Study days', hint: '5 XP for each day you studied' },
  session: { label: 'Shared study sessions', hint: '10 XP each' },
  groupQuiz: { label: 'Group quizzes', hint: '15 XP each' },
  post: { label: 'Feed posts', hint: '5 XP each (first 20)' },
};
export const MAX_POST_XP_POSTS = 20;

const ms = (d) => { const t = typeof d === 'number' ? d : new Date(d).getTime(); return Number.isFinite(t) ? t : 0; };
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const award = (id, kind, label, xp, date) => ({ id, kind, label, xp, date: ms(date) });

/**
 * All XP awards, newest first.
 * `attempts` and `sessions` are the saved quiz attempts and study-log sessions; `groupSessions`, `groupQuizzes` and `posts`
 * are lists of dates (ms or ISO) for shared sessions you joined, group quizzes you took and posts you wrote.
 */
export function buildAwards({ attempts = [], sessions = [], groupSessions = [], groupQuizzes = [], posts = [] } = {}) {
  const out = [];
  (Array.isArray(attempts) ? attempts : []).forEach((a) => {
    if (!a || typeof a !== 'object' || !a.id || !ms(a.date)) return;
    if (isFullAttempt(a)) out.push(award(`a${a.id}`, 'quiz', a.title || 'Practice quiz', 10 + Math.round(attemptPct(a) / 5), a.date));
    else out.push(award(`a${a.id}`, 'missed', a.title || 'Missed questions', 5, a.date));
  });
  (Array.isArray(sessions) ? sessions : []).forEach((s) => {
    if (!s || !ms(s.date)) return;
    if (s.kind === 'flashcards') out.push(award(`s${s.id}`, 'flashcards', s.title || 'Flashcard deck', 10 + Math.min(20, Math.max(0, Math.round(num(s.correct)))), s.date));
    else if (s.kind === 'reviewer') out.push(award(`s${s.id}`, 'reviewer', s.title || 'Reviewer', 15, s.date));
  });
  const days = new Set();
  activityEvents(sessions, attempts).forEach((e) => { const k = dayKey(e.date); if (k && !days.has(k)) { days.add(k); out.push(award(`d${k}`, 'day', 'Studied today', 5, `${k}T12:00:00`)); } });
  (Array.isArray(groupSessions) ? groupSessions : []).forEach((d, i) => ms(d) && out.push(award(`gs${i}-${ms(d)}`, 'session', 'Shared study session', 10, d)));
  (Array.isArray(groupQuizzes) ? groupQuizzes : []).forEach((d, i) => ms(d) && out.push(award(`gq${i}-${ms(d)}`, 'groupQuiz', 'Group quiz', 15, d)));
  (Array.isArray(posts) ? posts : []).filter((d) => ms(d)).sort((a, b) => ms(a) - ms(b)).slice(0, MAX_POST_XP_POSTS).forEach((d, i) => out.push(award(`p${i}-${ms(d)}`, 'post', 'Feed post', 5, d)));
  return out.sort((a, b) => b.date - a.date || a.id.localeCompare(b.id));
}

export const totalXp = (awards) => (Array.isArray(awards) ? awards : []).reduce((t, a) => t + num(a.xp), 0);
/** XP earned in the last `days` days (all time when `days` is not a number). */
export const xpSince = (awards, days, now = Date.now()) => totalXp((Array.isArray(awards) ? awards : []).filter((a) => !Number.isFinite(days) || a.date >= now - days * DAY));
/** XP per kind, biggest first; kinds with nothing earned are left out. */
export function xpBreakdown(awards) {
  const by = new Map();
  (Array.isArray(awards) ? awards : []).forEach((a) => { const e = by.get(a.kind) || { kind: a.kind, count: 0, xp: 0 }; e.count++; e.xp += num(a.xp); by.set(a.kind, e); });
  return [...by.values()].map((e) => ({ ...e, label: (XP_RULES[e.kind] || { label: e.kind }).label })).sort((a, b) => b.xp - a.xp);
}

/* ---------- Levels ---------- */
/** Total XP needed to reach `level`: 0, 100, 300, 600, 1000, ... (each level asks for 100 XP more than the last). */
export const xpForLevel = (level) => 50 * level * (level - 1);
export const LEVEL_TITLES = [[1, 'Beginner'], [3, 'Learner'], [5, 'Scholar'], [8, 'Expert'], [12, 'Master']];
export const titleFor = (level) => LEVEL_TITLES.reduce((t, [from, name]) => (level >= from ? name : t), LEVEL_TITLES[0][1]);

/** Level, title and progress towards the next level for a total XP. */
export function levelFor(xp) {
  const total = Math.max(0, Math.floor(num(xp))); let level = 1;
  while (xpForLevel(level + 1) <= total) level++;
  const from = xpForLevel(level); const to = xpForLevel(level + 1);
  return { level, title: titleFor(level), xp: total, into: total - from, needed: to - from, toNext: to - total, nextAt: to, pct: Math.round(((total - from) / (to - from)) * 100) };
}
