// Run with: npm test  (Node's built-in test runner, no extra packages)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dayKey, shiftDay, fmtTime, attemptPct, quizSummary, reviewerStatus, reviewerSummary, deckSummary, topicMastery,
  activityEvents, streaks, lastDays, buildProgress,
} from '../src/progressCalc.js';

const at = (key, h = 10) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d, h).toISOString(); };
const NOW = new Date(2026, 10, 17, 15); // 17 Nov 2026, local
const att = (id, quizId, score, n, date, extra = {}) => ({ id, quizId, title: `Quiz ${quizId}`, score, n, date, ...extra });

test('dayKey and shiftDay', () => {
  assert.equal(dayKey(new Date(2026, 10, 17, 23, 59)), '2026-11-17');
  assert.equal(dayKey('nope'), '');
  assert.equal(shiftDay('2026-11-01', -1), '2026-10-31');
  assert.equal(shiftDay('2026-12-31', 1), '2027-01-01');
  assert.equal(shiftDay('2026-03-01', -1), '2026-02-28');
});

test('fmtTime', () => {
  assert.equal(fmtTime(0), ''); assert.equal(fmtTime(NaN), ''); assert.equal(fmtTime(40), '40s');
  assert.equal(fmtTime(75), '1m'); assert.equal(fmtTime(3700), '1h 2m'); assert.equal(fmtTime(7200), '2h');
});

test('quizSummary groups by quiz, ignores missed retakes, and compares with the previous attempt', () => {
  const s = quizSummary([
    att('1', 'q1', 5, 10, at('2026-11-10')), att('2', 'q1', 8, 10, at('2026-11-12')),
    att('3', 'q2', 3, 4, at('2026-11-15')), att('4', 'q1', 10, 10, at('2026-11-13'), { kind: 'missed' }),
    { id: '5', title: 'Old sample', score: 1, n: 2, date: at('2026-11-01') }, null, { score: 1 },
  ]);
  assert.equal(s.taken, 4); // q1 x2, q2, old sample. The missed retake is not counted
  assert.equal(s.avg, Math.round((50 + 80 + 75 + 50) / 4));
  assert.equal(s.best, 80);
  const q1 = s.quizzes.find((q) => q.quizId === 'q1');
  assert.deepEqual([q1.count, q1.best, q1.latest, q1.avg, q1.delta, q1.latestId], [2, 80, 80, 65, 30, '2']);
  assert.equal(s.quizzes[0].quizId, 'q2'); // newest first
  assert.equal(s.quizzes.find((q) => !q.quizId).title, 'Old sample');
  assert.equal(quizSummary(undefined).avg, null);
  assert.equal(attemptPct({ score: 5, n: 0 }), 0);
});

test('reviewer status and summary ignore records of deleted reviewers', () => {
  assert.equal(reviewerStatus(undefined), 'new'); assert.equal(reviewerStatus({ opened: 2 }), 'progress'); assert.equal(reviewerStatus({ opened: 0, done: true }), 'done');
  const s = reviewerSummary([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }], { a: { opened: 1, done: true }, b: { opened: 3 }, gone: { done: true } });
  assert.deepEqual([s.total, s.done, s.progress, s.fresh, s.pct], [4, 1, 1, 2, 25]);
  assert.equal(reviewerSummary(null, null).pct, 0);
});

test('deckSummary and topicMastery', () => {
  const decks = [
    { id: 'd1', subject: 'AI', cards: [{ known: true }, { known: false }] },
    { id: 'd2', subject: 'AI', cards: [{ known: true }, { known: true }] },
    { id: 'd3', subject: 'Security', cards: [] }, { id: 'd4', subject: '', cards: [{ known: false }] },
  ];
  const s = deckSummary(decks, [{ kind: 'flashcards', refId: 'd1', date: at('2026-11-10') }, { kind: 'flashcards', refId: 'd1', date: at('2026-11-12') }]);
  assert.deepEqual([s.cards, s.known, s.pct, s.mastered], [5, 3, 60, 1]);
  assert.equal(s.rows[0].last.date, at('2026-11-12')); assert.equal(s.rows[1].last, null);
  assert.deepEqual(topicMastery(decks), [{ name: 'AI', pct: 75 }, { name: 'No subject', pct: 0 }]);
});

test('activityEvents merges sessions and attempts, newest first, skipping bad rows', () => {
  const ev = activityEvents(
    [{ id: 's1', kind: 'flashcards', refId: 'd1', title: 'Deck', date: at('2026-11-16'), secs: 90, total: 4, correct: 3 }, { id: 's2', kind: 'reviewer', refId: 'r1', title: 'Rev', date: at('2026-11-17') }, { id: 's3', kind: 'mystery', date: at('2026-11-17') }, { id: 's4', kind: 'reviewer', date: 'bad' }],
    [att('9', 'q1', 3, 4, at('2026-11-15'), { secs: 60 })],
  );
  assert.deepEqual(ev.map((e) => e.kind), ['reviewer', 'flashcards', 'quiz']);
  assert.equal(ev[1].detail, 'Knew 3 of 4 cards'); assert.equal(ev[2].to, '/quizzes/attempts/9');
});

test('streaks: alive until a full day is missed, best streak kept', () => {
  const ev = (...keys) => keys.map((k) => ({ date: at(k) }));
  assert.deepEqual(streaks([], NOW), { current: 0, best: 0, days: 0 });
  assert.equal(streaks(ev('2026-11-17', '2026-11-16', '2026-11-15'), NOW).current, 3);
  assert.equal(streaks(ev('2026-11-16', '2026-11-15'), NOW).current, 2); // nothing today yet, still alive
  assert.equal(streaks(ev('2026-11-15'), NOW).current, 0); // yesterday missed
  const s = streaks(ev('2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-16', '2026-11-16', '2026-11-17'), NOW);
  assert.deepEqual([s.current, s.best, s.days], [2, 4, 6]);
});

test('lastDays covers 7 days ending today', () => {
  const w = lastDays([{ date: at('2026-11-17'), secs: 30 }, { date: at('2026-11-17'), secs: 30 }, { date: at('2026-11-11') }, { date: at('2026-11-10') }], NOW);
  assert.equal(w.length, 7); assert.equal(w[0].key, '2026-11-11'); assert.equal(w[6].key, '2026-11-17'); assert.equal(w[6].today, true);
  assert.deepEqual([w[6].count, w[6].secs, w[0].count], [2, 60, 1]); // the 10th is outside the window
});

test('buildProgress works with nothing saved', () => {
  const p = buildProgress({}, NOW);
  assert.equal(p.hasActivity, false); assert.equal(p.reviewers.total, 0); assert.equal(p.quizzes.taken, 0); assert.equal(p.streak.current, 0); assert.equal(p.week.length, 7);
});
