// Run with: npm test  (Node's built-in test runner, no extra packages)
import test from 'node:test';
import assert from 'node:assert/strict';
import { ACHIEVEMENTS, GROUPS, achievementStatus, badgeTuples, byGroup, newlyEarned } from '../src/achievementsCalc.js';

const earned = (stats) => achievementStatus(stats).filter((a) => a.earned).map((a) => a.id);
const get = (stats, id) => achievementStatus(stats).find((a) => a.id === id);

test('the catalogue has unique ids, names and sensible targets', () => {
  assert.equal(new Set(ACHIEVEMENTS.map((a) => a.id)).size, ACHIEVEMENTS.length); assert.equal(new Set(ACHIEVEMENTS.map((a) => a.name)).size, ACHIEVEMENTS.length);
  assert.ok(ACHIEVEMENTS.every((a) => a.target > 0 && GROUPS.includes(a.group) && typeof a.value === 'function'));
});

test('nothing is earned without activity, even from missing stats', () => {
  assert.deepEqual(earned({}), []); assert.deepEqual(earned(undefined), []); assert.deepEqual(earned({ quizBest: null, streakBest: 'x' }), []);
});

test('milestones unlock exactly at their target', () => {
  assert.deepEqual(earned({ streakBest: 6 }), []); assert.deepEqual(earned({ streakBest: 7 }), ['streak-7']); assert.deepEqual(earned({ streakBest: 30 }), ['streak-7', 'streak-30']);
  assert.deepEqual(earned({ quizzesTaken: 1 }), ['first-quiz']); assert.deepEqual(earned({ quizzesTaken: 10 }), ['first-quiz', 'quiz-regular']);
  assert.deepEqual(earned({ quizBest: 89 }), []); assert.deepEqual(earned({ quizBest: 90, quizzesTaken: 0 }), ['quiz-master']);
  assert.deepEqual(earned({ decks: 5, materials: 10 }), ['deck-builder', 'bookworm']); assert.deepEqual(earned({ decks: 4, materials: 9 }), []);
  assert.deepEqual(earned({ earlyBird: true }), ['early-bird']); assert.deepEqual(earned({ reviewersDone: 3 }), ['finisher']);
  assert.deepEqual(earned({ rooms: 3, groupActivities: 3, posts: 3 }), ['team-player', 'group-learner', 'contributor']);
  assert.deepEqual(earned({ level: 5 }), ['level-5']); assert.deepEqual(earned({ level: 10 }), ['level-5', 'level-10']);
});

test('progress is capped at the target and reported as a percentage', () => {
  const a = get({ decks: 2 }, 'deck-builder'); assert.deepEqual([a.current, a.target, a.pct, a.earned], [2, 5, 40, false]);
  const b = get({ decks: 99 }, 'deck-builder'); assert.deepEqual([b.current, b.pct, b.earned], [5, 100, true]);
  assert.equal(get({ quizBest: 45 }, 'quiz-master').pct, 50);
});

test('Challenger stays locked until Quiz Challenges are real', () => {
  const all = { streakBest: 99, quizBest: 100, quizzesTaken: 99, decks: 99, materials: 99, rooms: 99, level: 99, posts: 99, groupActivities: 99, reviewersDone: 99, earlyBird: true };
  assert.equal(get(all, 'challenger').earned, false); assert.equal(get(all, 'challenger').soon, true);
  assert.equal(earned(all).length, ACHIEVEMENTS.length - 1);
});

test('unlock dates are only shown for earned badges and only when saved', () => {
  const a = achievementStatus({ streakBest: 7 }, { 'streak-7': '2026-11-10T00:00:00.000Z', 'streak-30': '2026-11-11T00:00:00.000Z', 'early-bird': null });
  assert.equal(a.find((x) => x.id === 'streak-7').at, '2026-11-10T00:00:00.000Z'); assert.equal(a.find((x) => x.id === 'streak-30').at, null);
  assert.equal(achievementStatus({ streakBest: 7 }, 'junk').find((x) => x.id === 'streak-7').at, null);
});

test('badgeTuples keeps the profile shape [name, description, icon, earned]', () => {
  const t = badgeTuples({ streakBest: 7 }); assert.equal(t.length, ACHIEVEMENTS.length); assert.deepEqual(t[0], ['7-Day Streak', 'Study 7 days in a row', 'Flame', true]);
});

test('byGroup keeps the group order, and newlyEarned finds badges missing from the saved record', () => {
  const list = achievementStatus({ streakBest: 7, quizzesTaken: 1 });
  assert.deepEqual(byGroup(list).map((g) => g.group), GROUPS); assert.equal(byGroup(list).reduce((t, g) => t + g.items.length, 0), ACHIEVEMENTS.length);
  assert.deepEqual(newlyEarned(list, {}), ['streak-7', 'first-quiz']); assert.deepEqual(newlyEarned(list, { 'streak-7': null }), ['first-quiz']); assert.deepEqual(newlyEarned(list, undefined), ['streak-7', 'first-quiz']);
});
