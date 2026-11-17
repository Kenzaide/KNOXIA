/**
 * Friends rules (Patch 16).
 *
 * Pure functions only: no storage, no React. The same input always gives the same output, which is
 * what lets `npm test` cover them (test/friendsCalc.test.mjs). Storage and hooks live in
 * `src/friendsStore.js`, the screens in `src/friends.jsx`.
 *
 * A friendship is one record shared by both people:
 *   { id, from, to, status: 'pending' | 'accepted', createdAt, respondedAt }
 * `from` sent the request to `to`. There is never more than one record for the same two people.
 * People are identified by their account id (`src/accounts.js`), never by email.
 *
 * Every action takes the current records and returns `{ records, ok?, error?, kind?, record? }`.
 * When `error` is set, `records` is unchanged and nothing should be saved.
 */

/* ---------- Sample people ---------- */
// Seeded classmates so one person can try the whole flow alone in this demo. They are not accounts
// and never log in, so a request to one is accepted straight away. Replace with real users once a
// backend exists.
export const SAMPLE_PREFIX = 'sample:';
export const isSampleId = (id) => typeof id === 'string' && id.startsWith(SAMPLE_PREFIX);
const sample = (username, first, last) => ({
  id: SAMPLE_PREFIX + username, username, displayName: `${first} ${last}`, fullName: `${first} ${last}`,
  initials: (first[0] + last[0]).toUpperCase(), avatar: '', academic: '3rd Year • BSCS', createdAt: 0, email: '', sample: true,
});
export const SAMPLE_PEOPLE = [sample('alexrivera', 'Alex', 'Rivera'), sample('mikas', 'Mika', 'Santos'), sample('jordanlee', 'Jordan', 'Lee')];
export const samplePersonByUsername = (username) => {
  const u = String(username || '').trim().toLowerCase();
  return SAMPLE_PEOPLE.find((p) => p.username === u) || null;
};

/* ---------- Records ---------- */
export const isRecord = (r) => !!r && typeof r === 'object' && typeof r.id === 'string' && typeof r.from === 'string' && typeof r.to === 'string'
  && !!r.from && !!r.to && r.from !== r.to && (r.status === 'pending' || r.status === 'accepted') && Number.isFinite(r.createdAt);
/** Saved data can be missing, corrupt or edited by hand: keep only well-formed records, one per pair. */
export function cleanRecords(records) {
  if (!Array.isArray(records)) return [];
  const seen = new Set(); const out = [];
  for (const r of records) {
    if (!isRecord(r)) continue;
    const pair = [r.from, r.to].sort().join('|'); if (seen.has(pair)) continue;
    seen.add(pair); out.push(r);
  }
  return out;
}
export const newRecordId = () => `fr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const between = (r, a, b) => (r.from === a && r.to === b) || (r.from === b && r.to === a);
export const findRecord = (records, a, b) => cleanRecords(records).find((r) => between(r, a, b)) || null;

/** How `me` stands with `other`: 'self' | 'friends' | 'sent' (I asked) | 'received' (they asked) | 'none'. */
export function relation(records, me, other) {
  if (!me || !other) return 'none';
  if (me === other) return 'self';
  const r = findRecord(records, me, other); if (!r) return 'none';
  return r.status === 'accepted' ? 'friends' : r.from === me ? 'sent' : 'received';
}

/* ---------- Lists (newest first) ---------- */
const byNewest = (a, b) => (b.since - a.since) || a.otherId.localeCompare(b.otherId);
const row = (r, me, since) => ({ record: r, id: r.id, otherId: r.from === me ? r.to : r.from, since });
/** Accepted friendships of `me`. `since` is when they became friends. */
export const friendsOf = (records, me) => cleanRecords(records).filter((r) => r.status === 'accepted' && (r.from === me || r.to === me)).map((r) => row(r, me, r.respondedAt || r.createdAt)).sort(byNewest);
/** Requests other people sent to `me` that are still waiting. */
export const incomingOf = (records, me) => cleanRecords(records).filter((r) => r.status === 'pending' && r.to === me).map((r) => row(r, me, r.createdAt)).sort(byNewest);
/** Requests `me` sent that are still waiting. */
export const outgoingOf = (records, me) => cleanRecords(records).filter((r) => r.status === 'pending' && r.from === me).map((r) => row(r, me, r.createdAt)).sort(byNewest);

/* ---------- Actions ---------- */
const fail = (list, error) => ({ records: list, error });

/**
 * `me` asks `other` to be friends.
 *  - If `other` already asked `me`, the two requests meet and they become friends (kind 'accepted').
 *  - A sample person accepts immediately (kind 'accepted').
 *  - Otherwise a pending request is created (kind 'sent').
 */
export function requestFriend(records, me, other, now = Date.now(), id = newRecordId()) {
  const list = cleanRecords(records);
  if (!me || !other) return fail(list, 'Sign in to add friends.');
  if (me === other) return fail(list, 'You cannot add yourself as a friend.');
  const existing = findRecord(list, me, other);
  if (existing) {
    if (existing.status === 'accepted') return fail(list, 'You are already friends.');
    if (existing.from === me) return fail(list, 'You already sent this person a request.');
    return { ...acceptRequest(list, me, existing.id, now), kind: 'accepted' };
  }
  const instant = isSampleId(other);
  const record = { id, from: me, to: other, status: instant ? 'accepted' : 'pending', createdAt: now, respondedAt: instant ? now : null };
  return { records: [...list, record], ok: true, kind: instant ? 'accepted' : 'sent', record };
}

/** The person who received a pending request accepts it. */
export function acceptRequest(records, me, requestId, now = Date.now()) {
  const list = cleanRecords(records); const r = list.find((x) => x.id === requestId);
  if (!r) return fail(list, 'This request is no longer available.');
  if (r.status !== 'pending') return fail(list, 'You are already friends.');
  if (r.to !== me) return fail(list, 'Only the person who received a request can accept it.');
  const record = { ...r, status: 'accepted', respondedAt: now };
  return { records: list.map((x) => (x.id === r.id ? record : x)), ok: true, kind: 'accepted', record };
}

/** The person who received a pending request declines it. The other person may ask again later. */
export function declineRequest(records, me, requestId) {
  const list = cleanRecords(records); const r = list.find((x) => x.id === requestId);
  if (!r || r.status !== 'pending') return fail(list, 'This request is no longer available.');
  if (r.to !== me) return fail(list, 'Only the person who received a request can decline it.');
  return { records: list.filter((x) => x.id !== r.id), ok: true, kind: 'declined', record: r };
}

/** The person who sent a pending request takes it back. */
export function cancelRequest(records, me, requestId) {
  const list = cleanRecords(records); const r = list.find((x) => x.id === requestId);
  if (!r || r.status !== 'pending') return fail(list, 'This request is no longer available.');
  if (r.from !== me) return fail(list, 'Only the person who sent a request can cancel it.');
  return { records: list.filter((x) => x.id !== r.id), ok: true, kind: 'cancelled', record: r };
}

/** Either friend ends the friendship. */
export function removeFriend(records, me, other) {
  const list = cleanRecords(records); const r = list.find((x) => x.status === 'accepted' && between(x, me, other));
  if (!r) return fail(list, 'You are not friends with this person.');
  return { records: list.filter((x) => x.id !== r.id), ok: true, kind: 'removed', record: r };
}

/* ---------- Finding people ---------- */
export const MIN_QUERY = 2;
export const normalizeQuery = (q) => String(q || '').trim().replace(/^@+/, '').toLowerCase();

/**
 * People matching what was typed, best match first. Matches names and usernames (every word must
 * appear). An email only matches when typed in full, so nobody can fish for addresses.
 * Returns [] until at least MIN_QUERY characters are typed. Never includes `meId`.
 */
export function searchPeople(people, query, meId, limit = 20) {
  const q = normalizeQuery(query); if (q.length < MIN_QUERY) return [];
  const words = q.split(/\s+/).filter(Boolean);
  const rank = (p) => { const u = p.username.toLowerCase(); const n = p.displayName.toLowerCase(); return u === q ? 0 : u.startsWith(q) || n.startsWith(q) ? 1 : 2; };
  return (people || [])
    .filter((p) => p && p.id && p.id !== meId && typeof p.username === 'string' && typeof p.displayName === 'string')
    .filter((p) => {
      const hay = `${p.displayName} ${p.fullName || ''} ${p.username}`.toLowerCase();
      return words.every((w) => hay.includes(w)) || (!!p.email && p.email.toLowerCase() === q);
    })
    .sort((a, b) => rank(a) - rank(b) || a.displayName.localeCompare(b.displayName))
    .slice(0, limit);
}

/** People `me` could add: real accounts first (newest first), then sample people. Skips anyone already connected. */
export function suggestPeople(people, records, meId, limit = 6) {
  return (people || [])
    .filter((p) => p && p.id && p.id !== meId && relation(records, meId, p.id) === 'none')
    .sort((a, b) => (a.sample ? 1 : 0) - (b.sample ? 1 : 0) || (b.createdAt || 0) - (a.createdAt || 0) || a.displayName.localeCompare(b.displayName))
    .slice(0, limit);
}
