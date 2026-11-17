import { buildAwards, totalXp, xpSince } from './xpCalc.js';
import { streaks, activityEvents, dayKey, shiftDay, attemptPct, isFullAttempt } from './progressCalc.js';

const safeList = (x) => Array.isArray(x) ? x : [];
export const missionPeriod = (kind, now = new Date()) => {
  const today = dayKey(now);
  if (kind === 'daily') return today;
  const day = now.getDay();
  return shiftDay(today, -(day + 6) % 7); // Monday start, local calendar
};
export const MISSIONS = [
  { id: 'daily-quiz', period: 'daily', name: 'Quiz warm-up', description: 'Finish 1 quiz today', kind: 'quiz', target: 1, reward: 20 },
  { id: 'daily-study', period: 'daily', name: 'Study session', description: 'Complete 1 flashcard or reviewer session today', kind: 'study', target: 1, reward: 15 },
  { id: 'weekly-quizzes', period: 'weekly', name: 'Quiz explorer', description: 'Finish 3 quizzes this week', kind: 'quiz', target: 3, reward: 50 },
  { id: 'weekly-days', period: 'weekly', name: 'Consistent learner', description: 'Study on 4 different days this week', kind: 'day', target: 4, reward: 60 },
  { id: 'weekly-flashcards', period: 'weekly', name: 'Flashcard champion', description: 'Finish 3 flashcard sessions this week', kind: 'flashcards', target: 3, reward: 40 },
];
const inPeriod = (date, period, now) => {
  const d = dayKey(date); const start = missionPeriod(period, now); const today = dayKey(now);
  return d && d >= start && d <= today;
};
export function missionProgress(awards, now = new Date()) {
  return MISSIONS.map(m => {
    const relevant = safeList(awards).filter(a => inPeriod(a.date, m.period, now));
    const count = m.kind === 'day' ? new Set(relevant.filter(a => a.kind === 'day').map(a => dayKey(a.date))).size
      : relevant.filter(a => m.kind === 'study' ? ['flashcards', 'reviewer'].includes(a.kind) : a.kind === m.kind).length;
    return { ...m, periodKey: missionPeriod(m.period, now), count, done: count >= m.target, pct: Math.min(100, Math.round(count / m.target * 100)) };
  });
}
export const claimId = (mission) => `${mission.id}:${mission.periodKey}`;
export function claimedAwards(claims) {
  return safeList(claims).filter(c => c && typeof c.id === 'string' && MISSIONS.some(m => c.id.startsWith(m.id + ':') && c.xp === m.reward) && Number.isFinite(c.at))
    .filter((c, i, arr) => arr.findIndex(x => x.id === c.id) === i)
    .map(c => ({ id: `mission:${c.id}`, kind: 'mission', label: 'Mission reward', xp: c.xp, date: c.at }));
}
export function leaderboardStats({ attempts = [], sessions = [], posts = [], groupSessions = [], groupQuizzes = [], claims = [] } = {}, now = Date.now()) {
  const base = buildAwards({ attempts, sessions, posts, groupSessions, groupQuizzes });
  const awards = [...base, ...claimedAwards(claims)];
  const full = safeList(attempts).filter(isFullAttempt);
  const avg = full.length ? Math.round(full.reduce((n, a) => n + attemptPct(a), 0) / full.length) : null;
  return { xp: totalXp(awards), week: xpSince(awards, 7, now), month: xpSince(awards, 30, now), quizzes: full.length, avg,
    streak: streaks(activityEvents(sessions, attempts), new Date(now)).current };
}
export function rankPeople(rows, metric = 'xp') {
  return [...rows].sort((a, b) => (b[metric] ?? -1) - (a[metric] ?? -1) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    .map((r, i) => ({ ...r, rank: i + 1 }));
}
