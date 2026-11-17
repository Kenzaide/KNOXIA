/**
 * Group study activity rules (Patch 22): shared study sessions, group quizzes and shared goal lists inside a study room.
 *
 * Pure functions only: no storage, no React (tested by test/activitiesCalc.test.mjs). Storage and hooks are in
 * `src/activitiesStore.js`, the screens in `src/activities.jsx`. Room membership comes from `src/roomsCalc.js`.
 *
 *   every activity   { id, roomId, kind, title, createdBy, createdAt }
 *   kind 'session'   + { minutes, startedAt, endsAt, joinedIds: [] }
 *   kind 'quiz'      + { questions: [[text, options, correctIndex, explanation]], results: [{ userId, score, n, secs, at }] }
 *   kind 'goals'     + { items: [{ id, text, addedBy, doneBy }] }   (doneBy is the person who ticked it, or null)
 *
 * Every action returns `{ activities, ok?, error?, activity? }`; when `error` is set, `activities` is unchanged.
 */
import { cleanRooms, isMember, isOwner, cleanText } from './roomsCalc.js';

export const SESSION_MINUTES = [15, 25, 50];
export const MAX_TITLE = 60;
export const MAX_GOAL = 100;
export const MAX_GOALS = 20;
export const MAX_QUIZ_QUESTIONS = 20;
export const MAX_PER_ROOM = 30; // the oldest activities of a room are dropped first

export const newActivityId = () => `act_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/* ---------- Shapes ---------- */
const strs = (v) => (Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === 'string' && x))] : []);
const isTuple = (q) => Array.isArray(q) && typeof q[0] === 'string' && !!q[0] && Array.isArray(q[1]) && q[1].length >= 2 && q[1].every((o) => typeof o === 'string')
  && Number.isInteger(q[2]) && q[2] >= 0 && q[2] < q[1].length;
export const isActivity = (a) => !!a && typeof a === 'object' && typeof a.id === 'string' && !!a.id && typeof a.roomId === 'string' && typeof a.createdBy === 'string'
  && Number.isFinite(a.createdAt) && typeof a.title === 'string'
  && (a.kind === 'session' ? Number.isFinite(a.startedAt) && Number.isFinite(a.endsAt)
    : a.kind === 'quiz' ? Array.isArray(a.questions) && a.questions.length > 0 && a.questions.every(isTuple)
    : a.kind === 'goals' ? true : false);
/** Saved data can be missing, corrupt or edited by hand: keep only well-formed activities and tidy their lists. */
export const cleanActivities = (list) => (Array.isArray(list) ? list : []).filter(isActivity).map((a) => {
  if (a.kind === 'session') return { ...a, joinedIds: strs(a.joinedIds) };
  if (a.kind === 'quiz') return { ...a, results: (Array.isArray(a.results) ? a.results : []).filter((r) => r && typeof r.userId === 'string' && Number.isFinite(r.score) && Number.isFinite(r.n)) };
  return { ...a, items: (Array.isArray(a.items) ? a.items : []).filter((i) => i && typeof i.id === 'string' && typeof i.text === 'string' && i.text) };
});

const fail = (activities, error) => ({ activities, error });
const roomOf = (rooms, roomId) => cleanRooms(rooms).find((r) => r.id === roomId) || null;
const mapOne = (list, id, fn) => list.map((a) => (a.id === id ? fn(a) : a));
/** Adds an activity, then trims the room to its newest MAX_PER_ROOM. */
function add(list, activity) {
  const all = [activity, ...list]; const mine = all.filter((a) => a.roomId === activity.roomId).sort((a, b) => b.createdAt - a.createdAt);
  const drop = new Set(mine.slice(MAX_PER_ROOM).map((a) => a.id));
  return all.filter((a) => !drop.has(a.id));
}
/** Checks the room exists and `me` is in it; returns { room } or { error }. */
function member(rooms, me, roomId) {
  const room = roomOf(rooms, roomId);
  if (!room) return { error: 'That room no longer exists.' };
  if (!isMember(room, me)) return { error: 'Join the room to take part.' };
  return { room };
}
const find = (list, id) => list.find((a) => a.id === id) || null;

/* ---------- Lists ---------- */
export const activitiesOf = (activities, roomId) => cleanActivities(activities).filter((a) => a.roomId === roomId).sort((a, b) => (b.createdAt - a.createdAt) || a.id.localeCompare(b.id));
export const dropRoomActivities = (activities, roomId) => cleanActivities(activities).filter((a) => a.roomId !== roomId);

/* ---------- Shared study session ---------- */
/** Seconds left in a session (0 once it has ended). */
export const secondsLeft = (a, now = Date.now()) => Math.max(0, Math.ceil((a.endsAt - now) / 1000));
export const isActive = (a, now = Date.now()) => a.kind === 'session' && secondsLeft(a, now) > 0;
export const activeSession = (activities, roomId, now = Date.now()) => activitiesOf(activities, roomId).find((a) => isActive(a, now)) || null;

/** A member starts a timed session for the room and is the first to join it. Only one session runs at a time per room. */
export function startSession(activities, rooms, me, roomId, { title, minutes } = {}, now = Date.now(), id = newActivityId()) {
  const m = member(rooms, me, roomId); if (m.error) return fail(activities, m.error);
  if (!SESSION_MINUTES.includes(Number(minutes))) return fail(activities, 'Pick a session length.');
  if (activeSession(activities, roomId, now)) return fail(activities, 'A session is already running in this room.');
  const mins = Number(minutes);
  const a = { id, roomId, kind: 'session', title: cleanText(title, MAX_TITLE) || 'Focus session', createdBy: me, createdAt: now, minutes: mins, startedAt: now, endsAt: now + mins * 60_000, joinedIds: [me] };
  return { activities: add(cleanActivities(activities), a), ok: true, activity: a };
}
export function joinSession(activities, rooms, me, id, now = Date.now()) {
  const list = cleanActivities(activities); const a = find(list, id);
  if (!a || a.kind !== 'session') return fail(activities, 'That session no longer exists.');
  const m = member(rooms, me, a.roomId); if (m.error) return fail(activities, m.error);
  if (!isActive(a, now)) return fail(activities, 'This session has ended.');
  if (a.joinedIds.includes(me)) return fail(activities, 'You are already in this session.');
  return { activities: mapOne(list, id, (x) => ({ ...x, joinedIds: [...x.joinedIds, me] })), ok: true };
}
export function leaveSession(activities, me, id, now = Date.now()) {
  const list = cleanActivities(activities); const a = find(list, id);
  if (!a || a.kind !== 'session') return fail(activities, 'That session no longer exists.');
  if (!isActive(a, now)) return fail(activities, 'This session has ended.');
  if (!a.joinedIds.includes(me)) return fail(activities, 'You are not in this session.');
  return { activities: mapOne(list, id, (x) => ({ ...x, joinedIds: x.joinedIds.filter((i) => i !== me) })), ok: true };
}

/* ---------- Group quiz ---------- */
/** Shares a quiz with the room. `questions` are [text, options, correctIndex, explanation] tuples (a copy is stored, so later edits to your own quiz do not change it). */
export function shareQuiz(activities, rooms, me, roomId, { title, questions } = {}, now = Date.now(), id = newActivityId()) {
  const m = member(rooms, me, roomId); if (m.error) return fail(activities, m.error);
  const qs = (Array.isArray(questions) ? questions : []).filter(isTuple).slice(0, MAX_QUIZ_QUESTIONS).map((q) => [q[0], [...q[1]], q[2], typeof q[3] === 'string' ? q[3] : '']);
  if (qs.length === 0) return fail(activities, 'That quiz has no questions to share.');
  const a = { id, roomId, kind: 'quiz', title: cleanText(title, MAX_TITLE) || 'Group quiz', createdBy: me, createdAt: now, questions: qs, results: [] };
  return { activities: add(cleanActivities(activities), a), ok: true, activity: a };
}
/** Correct answers out of the quiz length. `answers` holds the chosen option index per question, or null when skipped. */
export const gradeAnswers = (questions, answers) => questions.reduce((n, q, i) => n + (Array.isArray(answers) && answers[i] === q[2] ? 1 : 0), 0);
/** Records a member's result. Each person has one place on the board: a retake only replaces it with a better score (or the same score, faster). */
export function submitQuiz(activities, rooms, me, id, answers, secs = 0, now = Date.now()) {
  const list = cleanActivities(activities); const a = find(list, id);
  if (!a || a.kind !== 'quiz') return fail(activities, 'That quiz no longer exists.');
  const m = member(rooms, me, a.roomId); if (m.error) return fail(activities, m.error);
  const result = { userId: me, score: gradeAnswers(a.questions, answers), n: a.questions.length, secs: Math.max(0, Math.round(Number(secs) || 0)), at: now };
  const prev = a.results.find((r) => r.userId === me);
  const better = !prev || result.score > prev.score || (result.score === prev.score && result.secs < prev.secs);
  const results = better ? [...a.results.filter((r) => r.userId !== me), result] : a.results;
  return { activities: mapOne(list, id, (x) => ({ ...x, results })), ok: true, result, improved: better };
}
/** Best score first, then fastest. */
export const leaderboard = (a) => [...(a.results || [])].sort((x, y) => (y.score - x.score) || (x.secs - y.secs) || (x.at - y.at));

/* ---------- Shared goal list ---------- */
export function createGoals(activities, rooms, me, roomId, title, now = Date.now(), id = newActivityId()) {
  const m = member(rooms, me, roomId); if (m.error) return fail(activities, m.error);
  const a = { id, roomId, kind: 'goals', title: cleanText(title, MAX_TITLE) || 'Study goals', createdBy: me, createdAt: now, items: [] };
  return { activities: add(cleanActivities(activities), a), ok: true, activity: a };
}
export function addGoal(activities, rooms, me, id, text, itemId = `g_${Math.random().toString(36).slice(2, 9)}`) {
  const list = cleanActivities(activities); const a = find(list, id);
  if (!a || a.kind !== 'goals') return fail(activities, 'That goal list no longer exists.');
  const m = member(rooms, me, a.roomId); if (m.error) return fail(activities, m.error);
  const t = cleanText(text, MAX_GOAL); if (!t) return fail(activities, 'Write the goal first.');
  if (a.items.length >= MAX_GOALS) return fail(activities, `A goal list holds up to ${MAX_GOALS} goals.`);
  return { activities: mapOne(list, id, (x) => ({ ...x, items: [...x.items, { id: itemId, text: t, addedBy: me, doneBy: null }] })), ok: true };
}
/** Anyone in the room can tick a goal (it records who did) or untick it. */
export function toggleGoal(activities, rooms, me, id, itemId) {
  const list = cleanActivities(activities); const a = find(list, id);
  if (!a || a.kind !== 'goals') return fail(activities, 'That goal list no longer exists.');
  const m = member(rooms, me, a.roomId); if (m.error) return fail(activities, m.error);
  if (!a.items.some((i) => i.id === itemId)) return fail(activities, 'That goal no longer exists.');
  return { activities: mapOne(list, id, (x) => ({ ...x, items: x.items.map((i) => (i.id === itemId ? { ...i, doneBy: i.doneBy ? null : me } : i)) })), ok: true };
}
export const goalProgress = (a) => { const items = a.items || []; const done = items.filter((i) => i.doneBy).length; return { done, total: items.length, pct: items.length ? Math.round((done / items.length) * 100) : 0 }; };

/* ---------- Removing ---------- */
/** The person who started an activity, or the room's host, can remove it. */
export function deleteActivity(activities, rooms, me, id) {
  const list = cleanActivities(activities); const a = find(list, id);
  if (!a) return fail(activities, 'That activity no longer exists.');
  if (a.createdBy !== me && !isOwner(roomOf(rooms, a.roomId), me)) return fail(activities, 'Only the person who started it, or the host, can remove it.');
  return { activities: list.filter((x) => x.id !== id), ok: true };
}
