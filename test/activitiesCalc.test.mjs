// Run with: npm test  (Node's built-in test runner, no extra packages)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, joinRoom } from '../src/roomsCalc.js';
import {
  MAX_GOALS, MAX_PER_ROOM, MAX_QUIZ_QUESTIONS, cleanActivities, activitiesOf, dropRoomActivities, secondsLeft, isActive, activeSession,
  startSession, joinSession, leaveSession, shareQuiz, gradeAnswers, submitQuiz, leaderboard, createGoals, addGoal, toggleGoal, goalProgress, deleteActivity,
} from '../src/activitiesCalc.js';

const rooms = joinRoom(createRoom([], 'ana', { name: 'Calc' }, 1, 'r1').rooms, 'ben', 'r1').rooms; // ana (host) and ben are members; cy is not
const Q = [['2+2?', ['3', '4'], 1, 'four'], ['Capital of France?', ['Paris', 'Rome', 'Oslo'], 0, '']];
const T = 1_000_000;

test('startSession: members only, valid length, one running session per room, creator joins', () => {
  const out = startSession([], rooms, 'ana', 'r1', { title: '  Limits   review ', minutes: 25 }, T, 's1');
  assert.equal(out.ok, true);
  assert.deepEqual(out.activity, { id: 's1', roomId: 'r1', kind: 'session', title: 'Limits review', createdBy: 'ana', createdAt: T, minutes: 25, startedAt: T, endsAt: T + 25 * 60_000, joinedIds: ['ana'] });
  assert.match(startSession([], rooms, 'cy', 'r1', { minutes: 25 }).error, /Join the room/);
  assert.match(startSession([], rooms, 'ana', 'r1', { minutes: 7 }).error, /length/);
  assert.match(startSession([], rooms, 'ana', 'nope', { minutes: 25 }).error, /no longer/);
  assert.match(startSession(out.activities, rooms, 'ben', 'r1', { minutes: 15 }, T + 1000).error, /already running/);
  assert.equal(startSession(out.activities, rooms, 'ben', 'r1', { minutes: 15 }, T + 26 * 60_000).ok, true); // the first one has ended
  assert.equal(startSession([], rooms, 'ana', 'r1', { minutes: 15 }, T).activity.title, 'Focus session');
});

test('session countdown, join and leave', () => {
  const s = startSession([], rooms, 'ana', 'r1', { minutes: 15 }, T, 's1').activities;
  assert.equal(secondsLeft(s[0], T + 60_000), 14 * 60); assert.equal(secondsLeft(s[0], T + 99 * 60_000), 0);
  assert.equal(isActive(s[0], T), true); assert.equal(activeSession(s, 'r1', T + 16 * 60_000), null);
  const j = joinSession(s, rooms, 'ben', 's1', T + 1000); assert.deepEqual(j.activities[0].joinedIds, ['ana', 'ben']);
  assert.match(joinSession(j.activities, rooms, 'ben', 's1', T + 1000).error, /already/);
  assert.match(joinSession(s, rooms, 'cy', 's1', T + 1000).error, /Join the room/);
  assert.match(joinSession(s, rooms, 'ben', 's1', T + 16 * 60_000).error, /ended/);
  assert.deepEqual(leaveSession(j.activities, 'ben', 's1', T + 2000).activities[0].joinedIds, ['ana']);
  assert.match(leaveSession(s, 'ben', 's1', T + 2000).error, /not in/);
});

test('shareQuiz keeps a copy of the questions, caps the count and needs at least one', () => {
  const out = shareQuiz([], rooms, 'ana', 'r1', { title: 'Warm-up', questions: Q }, T, 'q1');
  assert.equal(out.ok, true); assert.deepEqual(out.activity.questions, Q); assert.notEqual(out.activity.questions[0], Q[0]); assert.deepEqual(out.activity.results, []);
  assert.match(shareQuiz([], rooms, 'ana', 'r1', { questions: [] }).error, /no questions/);
  assert.match(shareQuiz([], rooms, 'ana', 'r1', { questions: [['bad', ['a'], 0]] }).error, /no questions/);
  assert.match(shareQuiz([], rooms, 'cy', 'r1', { questions: Q }).error, /Join the room/);
  const many = Array.from({ length: 40 }, () => Q[0]);
  assert.equal(shareQuiz([], rooms, 'ana', 'r1', { questions: many }).activity.questions.length, MAX_QUIZ_QUESTIONS);
});

test('grading counts correct answers; skipped questions are wrong', () => {
  assert.equal(gradeAnswers(Q, [1, 0]), 2); assert.equal(gradeAnswers(Q, [1, null]), 1); assert.equal(gradeAnswers(Q, [0, 2]), 0); assert.equal(gradeAnswers(Q, null), 0);
});

test('submitQuiz: one place per member, a retake only replaces it with a better (or faster) result', () => {
  const base = shareQuiz([], rooms, 'ana', 'r1', { questions: Q }, T, 'q1').activities;
  const a = submitQuiz(base, rooms, 'ben', 'q1', [1, 2], 40.4, T + 1); assert.equal(a.result.score, 1); assert.equal(a.result.secs, 40);
  const worse = submitQuiz(a.activities, rooms, 'ben', 'q1', [0, 2], 10, T + 2); assert.equal(worse.improved, false); assert.equal(worse.activities[0].results[0].score, 1);
  const better = submitQuiz(a.activities, rooms, 'ben', 'q1', [1, 0], 90, T + 3); assert.equal(better.improved, true); assert.equal(better.activities[0].results.length, 1); assert.equal(better.activities[0].results[0].score, 2);
  const faster = submitQuiz(a.activities, rooms, 'ben', 'q1', [1, 2], 20, T + 4); assert.equal(faster.activities[0].results[0].secs, 20);
  assert.match(submitQuiz(base, rooms, 'cy', 'q1', [1, 0], 5).error, /Join the room/);
  assert.match(submitQuiz(base, rooms, 'ben', 'zz', [1, 0], 5).error, /no longer/);
});

test('leaderboard: best score first, then fastest', () => {
  const a = { results: [{ userId: 'x', score: 1, n: 2, secs: 5, at: 1 }, { userId: 'y', score: 2, n: 2, secs: 90, at: 2 }, { userId: 'z', score: 2, n: 2, secs: 30, at: 3 }] };
  assert.deepEqual(leaderboard(a).map((r) => r.userId), ['z', 'y', 'x']);
});

test('goal lists: any member adds and ticks goals, ticking records who, limits apply', () => {
  const base = createGoals([], rooms, 'ana', 'r1', '', T, 'g1').activities; assert.equal(base[0].title, 'Study goals');
  const added = addGoal(base, rooms, 'ben', 'g1', '  Finish   chapter 3 ', 'i1'); assert.deepEqual(added.activities[0].items, [{ id: 'i1', text: 'Finish chapter 3', addedBy: 'ben', doneBy: null }]);
  assert.match(addGoal(base, rooms, 'ben', 'g1', '   ').error, /Write the goal/);
  assert.match(addGoal(base, rooms, 'cy', 'g1', 'x').error, /Join the room/);
  const ticked = toggleGoal(added.activities, rooms, 'ana', 'g1', 'i1'); assert.equal(ticked.activities[0].items[0].doneBy, 'ana');
  assert.deepEqual(goalProgress(ticked.activities[0]), { done: 1, total: 1, pct: 100 });
  assert.equal(toggleGoal(ticked.activities, rooms, 'ben', 'g1', 'i1').activities[0].items[0].doneBy, null);
  assert.match(toggleGoal(ticked.activities, rooms, 'ana', 'g1', 'nope').error, /no longer/);
  let full = base; for (let i = 0; i < MAX_GOALS; i++) full = addGoal(full, rooms, 'ana', 'g1', 'g' + i, 'id' + i).activities;
  assert.match(addGoal(full, rooms, 'ana', 'g1', 'one more').error, /up to/);
  assert.deepEqual(goalProgress({ items: [] }), { done: 0, total: 0, pct: 0 });
});

test('deleteActivity: creator or room host only; lists are per room, newest first, and trimmed', () => {
  const s = shareQuiz([], rooms, 'ben', 'r1', { questions: Q }, T, 'q1').activities;
  assert.deepEqual(deleteActivity(s, rooms, 'ben', 'q1').activities, []);
  assert.deepEqual(deleteActivity(s, rooms, 'ana', 'q1').activities, []); // the host
  const r2 = joinRoom(rooms, 'cy', 'r1').rooms; assert.match(deleteActivity(s, r2, 'cy', 'q1').error, /Only/);
  assert.match(deleteActivity(s, rooms, 'ana', 'gone').error, /no longer/);
  let list = []; for (let i = 0; i < MAX_PER_ROOM + 3; i++) list = createGoals(list, rooms, 'ana', 'r1', 'g' + i, T + i, 'id' + i).activities;
  const mine = activitiesOf(list, 'r1'); assert.equal(mine.length, MAX_PER_ROOM); assert.equal(mine[0].title, 'g' + (MAX_PER_ROOM + 2));
  assert.deepEqual(dropRoomActivities(list, 'r1'), []);
});

test('cleanActivities drops malformed items and tidies lists', () => {
  const out = cleanActivities([null, { id: 'x' }, { id: 'a', roomId: 'r', kind: 'goals', title: 't', createdBy: 'u', createdAt: 1, items: [null, { id: 'i', text: 'ok' }] },
    { id: 'b', roomId: 'r', kind: 'quiz', title: 't', createdBy: 'u', createdAt: 1, questions: [['q', ['a', 'b'], 5]] }]);
  assert.equal(out.length, 1); assert.equal(out[0].items.length, 1); assert.deepEqual(cleanActivities('nope'), []);
});
