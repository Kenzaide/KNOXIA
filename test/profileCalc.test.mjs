// Run with: npm test  (Node's built-in test runner, no extra packages)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_SHARED, VISIBILITY, DEFAULT_SOCIAL, isVisibility, cleanSocial, canSee, toggleShared, sharedMaterials,
  profileStats, recentEvents,
} from '../src/profileCalc.js';

const progress = (over = {}) => ({ events: [], streak: { current: 0, best: 0, days: 0 }, quizzes: { taken: 0, avg: null, best: null }, secs: 0, ...over });

test('default privacy is friends only, and every visibility option is valid', () => {
  assert.equal(DEFAULT_SOCIAL.visibility, 'friends'); assert.deepEqual(DEFAULT_SOCIAL.shared, []);
  assert.ok(VISIBILITY.every((o) => isVisibility(o.key))); assert.equal(isVisibility('public'), false);
});

test('cleanSocial always returns a complete, valid record', () => {
  assert.deepEqual(cleanSocial(null), DEFAULT_SOCIAL); assert.deepEqual(cleanSocial([]), DEFAULT_SOCIAL); assert.deepEqual(cleanSocial('x'), DEFAULT_SOCIAL);
  assert.deepEqual(cleanSocial({ visibility: 'everyone', shared: ['a', 'a', '', 3, 'b'] }), { visibility: 'everyone', shared: ['a', 'b'] });
  assert.equal(cleanSocial({ visibility: 'nobody' }).visibility, 'friends');
  assert.equal(cleanSocial({ shared: Array.from({ length: 50 }, (_, i) => `m${i}`) }).shared.length, MAX_SHARED);
});

test('canSee: you always see yourself; others follow the setting', () => {
  for (const v of ['everyone', 'friends', 'me', 'junk']) assert.equal(canSee(v, 'self'), true);
  assert.equal(canSee('everyone', 'none'), true); assert.equal(canSee('everyone', 'received'), true);
  assert.equal(canSee('friends', 'friends'), true); for (const r of ['none', 'sent', 'received']) assert.equal(canSee('friends', r), false);
  assert.equal(canSee('me', 'friends'), false); assert.equal(canSee('junk', 'friends'), false);
});

test('toggleShared adds, removes, and stops at the limit', () => {
  assert.deepEqual(toggleShared([], 'a'), { shared: ['a'] }); assert.deepEqual(toggleShared(['a', 'b'], 'a'), { shared: ['b'] });
  assert.ok(toggleShared([], '').error); assert.deepEqual(toggleShared(undefined, 'a'), { shared: ['a'] });
  const full = Array.from({ length: MAX_SHARED }, (_, i) => `m${i}`);
  const out = toggleShared(full, 'new'); assert.ok(out.error); assert.equal(out.shared, full); assert.equal(toggleShared(full, 'm0').shared.length, MAX_SHARED - 1);
});

test('sharedMaterials keeps only chosen, existing materials, newest first, with public details only', () => {
  const mats = [{ id: '1', name: 'Old', type: 'PDF', uploaded: '2026-01-01T00:00:00', subject: 'CS', secret: 'x' }, { id: '2', name: 'New', uploaded: '2026-06-01T00:00:00' }, { id: '3', name: 'Hidden', uploaded: '2026-07-01T00:00:00' }, null];
  const out = sharedMaterials(mats, ['1', '2', 'gone']); assert.deepEqual(out.map((m) => m.id), ['2', '1']);
  assert.equal('secret' in out[1], false); assert.equal(out[1].subject, 'CS'); assert.equal(out[0].type, '');
  assert.deepEqual(sharedMaterials(mats, []), []); assert.deepEqual(sharedMaterials('nope', ['1']), []); assert.deepEqual(sharedMaterials(mats, null), []);
});

test('profileStats reads progress safely', () => {
  const s = profileStats(progress({ streak: { current: 2, best: 9, days: 11 }, quizzes: { taken: 3, avg: 80, best: 95 }, secs: 600, events: [{ date: '2026-11-01T05:30:00' }, { date: '2026-11-01T13:00:00' }] }), { materials: 4, decks: 2, posts: 1 });
  assert.deepEqual([s.streakCurrent, s.streakBest, s.studyDays, s.quizzesTaken, s.quizBest, s.secs, s.materials, s.decks, s.posts], [2, 9, 11, 3, 95, 600, 4, 2, 1]);
  assert.equal(s.earlyBird, true);
  const empty = profileStats(undefined); assert.equal(empty.streakBest, 0); assert.equal(empty.quizBest, null); assert.equal(empty.earlyBird, false);
  assert.equal(profileStats(progress({ events: [{ date: 'nonsense' }] })).earlyBird, false);
});

test('profileStats carries the counts achievements need, with safe defaults', () => {
  const s = profileStats(progress({ reviewers: { done: 4 } }), { rooms: 3, groupActivities: 2, level: 5 });
  assert.equal(s.reviewersDone, 4); assert.equal(s.rooms, 3); assert.equal(s.groupActivities, 2); assert.equal(s.level, 5);
  const d = profileStats(undefined); assert.equal(d.reviewersDone, 0); assert.equal(d.rooms, 0); assert.equal(d.level, 1);
});

test('recentEvents takes the newest few', () => {
  assert.deepEqual(recentEvents([1, 2, 3, 4, 5, 6, 7], 3), [1, 2, 3]); assert.deepEqual(recentEvents(null), []); assert.equal(recentEvents([1, 2]).length, 2);
});
