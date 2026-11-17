// Run with: npm test  (Node's built-in test runner, no extra packages)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SAMPLE_PEOPLE, isSampleId, samplePersonByUsername, cleanRecords, relation, friendsOf, incomingOf, outgoingOf,
  requestFriend, acceptRequest, declineRequest, cancelRequest, removeFriend, normalizeQuery, searchPeople, suggestPeople, MIN_QUERY,
} from '../src/friendsCalc.js';

const person = (id, username, displayName, extra = {}) => ({ id, username, displayName, fullName: displayName, createdAt: 0, ...extra });
const ana = person('a1', 'ana.cruz', 'Ana Cruz', { email: 'ana@school.edu', createdAt: 300 });
const ben = person('b2', 'bencruz', 'Ben Cruz', { email: 'ben@school.edu', createdAt: 200 });
const cy = person('c3', 'cy_lim', 'Cy Lim', { email: 'cy@school.edu', createdAt: 100 });
const T = 1_000;

test('requestFriend creates one pending request and blocks self, duplicates and existing friends', () => {
  const r = requestFriend([], 'a1', 'b2', T, 'x1');
  assert.equal(r.ok, true); assert.equal(r.kind, 'sent');
  assert.deepEqual(r.records, [{ id: 'x1', from: 'a1', to: 'b2', status: 'pending', createdAt: T, respondedAt: null }]);
  assert.match(requestFriend([], 'a1', 'a1').error, /yourself/);
  assert.match(requestFriend([], '', 'b2').error, /Sign in/);
  assert.match(requestFriend(r.records, 'a1', 'b2').error, /already sent/);
  const friends = acceptRequest(r.records, 'b2', 'x1', T + 5).records;
  assert.match(requestFriend(friends, 'a1', 'b2').error, /already friends/);
  assert.match(requestFriend(friends, 'b2', 'a1').error, /already friends/);
  assert.equal(r.records.length, 1); // the failed attempts did not add anything
});

test('when the other person already asked, requesting back makes you friends', () => {
  const first = requestFriend([], 'b2', 'a1', T, 'x1').records;
  const r = requestFriend(first, 'a1', 'b2', T + 10);
  assert.equal(r.ok, true); assert.equal(r.kind, 'accepted');
  assert.equal(r.records.length, 1); // still one record for the pair
  assert.deepEqual([r.records[0].status, r.records[0].respondedAt], ['accepted', T + 10]);
  assert.equal(relation(r.records, 'a1', 'b2'), 'friends');
});

test('sample people accept straight away; real people do not', () => {
  const alex = SAMPLE_PEOPLE[0];
  assert.ok(isSampleId(alex.id)); assert.ok(!isSampleId('a1')); assert.ok(!isSampleId(undefined));
  const r = requestFriend([], 'a1', alex.id, T, 's1');
  assert.equal(r.kind, 'accepted'); assert.equal(r.records[0].status, 'accepted');
  assert.equal(relation(r.records, 'a1', alex.id), 'friends');
  assert.equal(samplePersonByUsername(' AlexRivera ').id, alex.id); assert.equal(samplePersonByUsername('nobody'), null);
});

test('only the receiver can accept or decline, only the sender can cancel', () => {
  const recs = requestFriend([], 'a1', 'b2', T, 'x1').records;
  assert.match(acceptRequest(recs, 'a1', 'x1').error, /received/);   // sender cannot accept their own request
  assert.match(acceptRequest(recs, 'c3', 'x1').error, /received/);   // a stranger cannot either
  assert.match(declineRequest(recs, 'a1', 'x1').error, /received/);
  assert.match(cancelRequest(recs, 'b2', 'x1').error, /sent a request/);
  assert.match(acceptRequest(recs, 'b2', 'nope').error, /no longer available/);
  assert.equal(declineRequest(recs, 'b2', 'x1').records.length, 0);
  assert.equal(cancelRequest(recs, 'a1', 'x1').records.length, 0);
  const done = acceptRequest(recs, 'b2', 'x1', T + 1);
  assert.equal(done.ok, true); assert.equal(done.records[0].status, 'accepted');
  assert.match(acceptRequest(done.records, 'b2', 'x1').error, /already friends/);
  assert.match(cancelRequest(done.records, 'a1', 'x1').error, /no longer available/); // cannot cancel a friendship as a request
});

test('after a decline or cancel, a new request can be sent', () => {
  const recs = requestFriend([], 'a1', 'b2', T, 'x1').records;
  assert.equal(requestFriend(declineRequest(recs, 'b2', 'x1').records, 'a1', 'b2', T + 1, 'x2').ok, true);
  assert.equal(requestFriend(cancelRequest(recs, 'a1', 'x1').records, 'a1', 'b2', T + 1, 'x2').ok, true);
});

test('removeFriend works from either side and only for accepted friendships', () => {
  const pending = requestFriend([], 'a1', 'b2', T, 'x1').records;
  assert.match(removeFriend(pending, 'a1', 'b2').error, /not friends/);
  const friends = acceptRequest(pending, 'b2', 'x1', T + 1).records;
  assert.equal(removeFriend(friends, 'a1', 'b2').records.length, 0);
  assert.equal(removeFriend(friends, 'b2', 'a1').records.length, 0);
  assert.match(removeFriend(friends, 'a1', 'c3').error, /not friends/);
});

test('relation and the three lists', () => {
  let recs = requestFriend([], 'a1', 'b2', 100, 'r1').records;          // a1 asked b2
  recs = requestFriend(recs, 'c3', 'a1', 200, 'r2').records;            // c3 asked a1
  recs = requestFriend(recs, 'a1', SAMPLE_PEOPLE[1].id, 300, 'r3').records; // sample friend
  recs = acceptRequest(requestFriend(recs, 'a1', 'd4', 400, 'r4').records, 'd4', 'r4', 500).records; // d4 friend
  assert.equal(relation(recs, 'a1', 'b2'), 'sent'); assert.equal(relation(recs, 'b2', 'a1'), 'received');
  assert.equal(relation(recs, 'a1', 'c3'), 'received'); assert.equal(relation(recs, 'a1', 'a1'), 'self');
  assert.equal(relation(recs, 'a1', 'zzz'), 'none'); assert.equal(relation(recs, '', 'b2'), 'none');
  assert.deepEqual(friendsOf(recs, 'a1').map((x) => x.otherId), ['d4', SAMPLE_PEOPLE[1].id]); // newest friendship first
  assert.equal(friendsOf(recs, 'a1')[0].since, 500);
  assert.deepEqual(incomingOf(recs, 'a1').map((x) => x.otherId), ['c3']);
  assert.deepEqual(outgoingOf(recs, 'a1').map((x) => x.otherId), ['b2']);
  assert.deepEqual(friendsOf(recs, 'b2'), []); assert.deepEqual(incomingOf(recs, 'b2').map((x) => x.otherId), ['a1']);
});

test('cleanRecords drops corrupt, self-pointing and duplicate-pair records', () => {
  const ok = { id: 'x1', from: 'a1', to: 'b2', status: 'pending', createdAt: 1, respondedAt: null };
  const cleaned = cleanRecords([ok, null, 'x', { id: 'x2' }, { ...ok, id: 'x3', from: 'a1', to: 'a1' }, { ...ok, id: 'x4', status: 'weird' },
    { ...ok, id: 'x5', createdAt: 'yesterday' }, { ...ok, id: 'x6', from: 'b2', to: 'a1' }]);
  assert.deepEqual(cleaned.map((r) => r.id), ['x1']); // x6 is the same pair as x1
  assert.deepEqual(cleanRecords(undefined), []); assert.deepEqual(cleanRecords({ a: 1 }), []);
  assert.equal(relation('garbage', 'a1', 'b2'), 'none');
});

test('searchPeople: needs MIN_QUERY characters, matches names and usernames, ranks exact first, never returns you', () => {
  const people = [cy, ben, ana, ...SAMPLE_PEOPLE];
  assert.equal(MIN_QUERY, 2); assert.deepEqual(searchPeople(people, 'c', 'zzz'), []); assert.deepEqual(searchPeople(people, '   ', 'zzz'), []);
  assert.deepEqual(searchPeople(people, 'cruz', 'zzz').map((p) => p.id), ['a1', 'b2']);           // both Cruz, alphabetical
  assert.deepEqual(searchPeople(people, 'cruz', 'a1').map((p) => p.id), ['b2']);                   // never yourself
  assert.deepEqual(searchPeople(people, '@bencruz', 'zzz').map((p) => p.id), ['b2']);              // leading @ ignored
  assert.deepEqual(searchPeople(people, 'ana cruz', 'zzz').map((p) => p.id), ['a1']);              // every word must match
  assert.deepEqual(searchPeople(people, 'CY_LIM', 'zzz').map((p) => p.id), ['c3']);                // case-insensitive
  assert.deepEqual(searchPeople([ben, person('x9', 'cruz', 'Zed Quinn'), ana], 'cruz', 'zzz').map((p) => p.id)[0], 'x9'); // exact username first
  assert.deepEqual(searchPeople(people, 'alex', 'zzz').map((p) => p.id), [SAMPLE_PEOPLE[0].id]);
  assert.equal(normalizeQuery('  @@Ana '), 'ana');
});

test('searchPeople matches an email only when it is typed in full', () => {
  const people = [ana, ben];
  assert.deepEqual(searchPeople(people, 'ana@school.edu', 'zzz').map((p) => p.id), ['a1']);
  assert.deepEqual(searchPeople(people, 'ANA@school.edu', 'zzz').map((p) => p.id), ['a1']);
  assert.deepEqual(searchPeople(people, 'school.edu', 'zzz'), []);   // a part of an email finds no one
  assert.deepEqual(searchPeople(people, 'ana@', 'zzz'), []);
  assert.deepEqual(searchPeople([null, {}, { id: 'q' }, ana], 'ana', 'zzz').map((p) => p.id), ['a1']); // bad entries are skipped
});

test('suggestPeople skips yourself and anyone already connected, real accounts before samples, newest first', () => {
  const people = [ana, ben, cy, ...SAMPLE_PEOPLE];
  const recs = requestFriend([], 'a1', 'c3', T, 'x1').records; // a1 already asked c3
  assert.deepEqual(suggestPeople(people, recs, 'a1', 10).map((p) => p.id), ['b2', 'sample:alexrivera', 'sample:jordanlee', 'sample:mikas']);
  assert.equal(suggestPeople(people, recs, 'a1', 2).length, 2);
  assert.deepEqual(suggestPeople([ana, ben, cy], [], 'zzz', 3).map((p) => p.id), ['a1', 'b2', 'c3']); // newest account first
  assert.deepEqual(suggestPeople(undefined, [], 'a1'), []);
});
