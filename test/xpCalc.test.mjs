// Run with: npm test  (Node's built-in test runner, no extra packages)
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAwards, totalXp, xpSince, xpBreakdown, xpForLevel, levelFor, titleFor, MAX_POST_XP_POSTS } from '../src/xpCalc.js';

const D = (day, h = 12) => new Date(2026, 10, day, h).toISOString();
const quiz = (id, score, n, date, extra = {}) => ({ id, score, n, date, title: 'Q', ...extra });

test('quizzes earn 10 XP plus up to 20 for the score; missed-question retakes earn 5', () => {
  const a = buildAwards({ attempts: [quiz('a', 10, 10, D(1)), quiz('b', 5, 10, D(2)), quiz('c', 0, 10, D(3)), quiz('d', 2, 4, D(4), { kind: 'missed' })] }).filter((x) => x.id.startsWith('a'));
  const xp = Object.fromEntries(a.map((x) => [x.id, x.xp])); assert.deepEqual(xp, { aa: 30, ab: 20, ac: 10, ad: 5 });
});

test('flashcard sessions earn 10 plus 1 per known card (up to 20); reviewers earn 15', () => {
  const a = buildAwards({ sessions: [{ id: '1', kind: 'flashcards', date: D(1), correct: 7 }, { id: '2', kind: 'flashcards', date: D(2), correct: 99 }, { id: '3', kind: 'reviewer', date: D(3) }] }).filter((x) => x.id.startsWith('s'));
  assert.deepEqual(Object.fromEntries(a.map((x) => [x.id, x.xp])), { s1: 17, s2: 30, s3: 15 });
});

test('each study day earns 5 XP once, however much was done that day', () => {
  const days = buildAwards({ attempts: [quiz('a', 1, 1, D(1, 9)), quiz('b', 1, 1, D(1, 20)), quiz('c', 1, 1, D(2))] }).filter((x) => x.kind === 'day');
  assert.equal(days.length, 2); assert.ok(days.every((x) => x.xp === 5));
});

test('group sessions, group quizzes and posts earn XP; only the first 20 posts count', () => {
  const posts = Array.from({ length: 25 }, (_, i) => Date.UTC(2026, 10, 1) + i * 1000);
  const a = buildAwards({ groupSessions: [D(1)], groupQuizzes: [D(2), D(3)], posts });
  const sum = (k) => a.filter((x) => x.kind === k).reduce((t, x) => t + x.xp, 0);
  assert.equal(sum('session'), 10); assert.equal(sum('groupQuiz'), 30); assert.equal(sum('post'), 5 * MAX_POST_XP_POSTS);
});

test('bad or missing data earns nothing and never throws', () => {
  assert.deepEqual(buildAwards(), []); assert.deepEqual(buildAwards({ attempts: [null, { id: 'x', date: 'nonsense' }, 'str'], sessions: [{}, { id: 1, kind: 'flashcards' }], groupSessions: ['bad'], posts: [null] }), []);
  assert.equal(totalXp(null), 0);
});

test('awards come newest first, totals add up, and xpSince filters by days', () => {
  const now = new Date(2026, 10, 17, 18).getTime();
  const a = buildAwards({ attempts: [quiz('old', 10, 10, D(1)), quiz('new', 10, 10, D(16))] });
  assert.ok(a[0].date >= a[a.length - 1].date);
  assert.equal(totalXp(a), 30 + 30 + 5 + 5);
  assert.equal(xpSince(a, 7, now), 35); assert.equal(xpSince(a, 30, now), 70); assert.equal(xpSince(a, null, now), 70);
});

test('xpBreakdown groups by kind, biggest first', () => {
  const b = xpBreakdown(buildAwards({ attempts: [quiz('a', 10, 10, D(1)), quiz('b', 10, 10, D(1))] }));
  assert.deepEqual(b.map((x) => [x.kind, x.count, x.xp]), [['quiz', 2, 60], ['day', 1, 5]]); assert.equal(b[0].label, 'Quizzes'); assert.deepEqual(xpBreakdown(null), []);
});

test('levels: thresholds 0, 100, 300, 600, 1000 and progress to the next', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(xpForLevel), [0, 100, 300, 600, 1000]);
  const l0 = levelFor(0); assert.equal(l0.level, 1); assert.equal(l0.toNext, 100); assert.equal(l0.pct, 0);
  assert.equal(levelFor(99).level, 1); assert.equal(levelFor(100).level, 2);
  const m = levelFor(200); assert.deepEqual([m.level, m.into, m.needed, m.toNext, m.pct, m.nextAt], [2, 100, 200, 100, 50, 300]);
  assert.equal(levelFor(1000).level, 5); assert.equal(levelFor(-5).xp, 0); assert.equal(levelFor('x').level, 1);
});

test('level titles', () => {
  assert.deepEqual([1, 2, 3, 5, 8, 12, 40].map(titleFor), ['Beginner', 'Beginner', 'Learner', 'Scholar', 'Expert', 'Master', 'Master']);
});
