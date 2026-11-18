/**
 * Friends storage and hooks (Patch 16). The rules are in `src/friendsCalc.js`.
 *
 * FRONTEND-ONLY DEMO: friendships are saved in this browser's localStorage under one shared key, so two
 * accounts registered in the same browser see the same requests (open a second tab and sign in as the
 * other person to try it). Like the rest of the demo this is not security: anyone using the browser can
 * edit it. A real backend should enforce "only the receiver can accept" on the server.
 *
 * Swapping in a backend later: keep the exported function names and make them call your API.
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { local } from './storage.js';
import { useProfile, emailKey } from './accounts.js';
import { useAuth } from './session.js';
import { supabase } from './lib/supabase.js';
import { KEYS, NOTES } from './data.js';
import { getFriendRequests, requestFriendship, acceptFriendship, declineFriendship, cancelFriendshipRequest, removeAcceptedFriendship } from './lib/friendsApi.js';
import {
  relation, friendsOf, incomingOf, outgoingOf,
} from './friendsCalc.js';

export const FRIENDS_KEY = 'knoxia-friendships'; // Legacy key; no longer used for friend requests.
const NONE = [];
let remoteRecords = NONE;
let activeUser = null;
let loaded = false;
let loadError = '';
const subscribers = new Set();
const notify = () => subscribers.forEach(fn => fn());
const subscribe = (fn) => { subscribers.add(fn); return () => subscribers.delete(fn); };
const snapshot = () => remoteRecords;
const asRecord = row => ({
  id: row.id, from: row.sender_id, to: row.receiver_id,
  status: row.status, createdAt: Date.parse(row.created_at), respondedAt: null,
});
export async function refreshFriendships() {
  if (!activeUser) return;
  const uid = activeUser;
  try {
    const rows = await getFriendRequests();
    if (activeUser !== uid) return;
    remoteRecords = rows.filter(r => r.status !== 'declined').map(asRecord);
    loadError = '';
  } catch (e) {
    if (activeUser !== uid) return;
    loadError = e.message || 'Could not load friends.';
    console.error('KNOXIA Friends:', e);
  } finally {
    if (activeUser === uid) { loaded = true; notify(); }
  }
}
export function useFriendships() {
  const { user } = useAuth();
  const records = useSyncExternalStore(subscribe, snapshot, () => NONE);
  useEffect(() => {
    const uid = user?.id || null;
    if (activeUser !== uid) {
      activeUser = uid; remoteRecords = NONE; loaded = !uid; loadError = ''; notify();
    }
    if (!uid) return;
    refreshFriendships();
    const interval = setInterval(refreshFriendships, 10000);
    return () => clearInterval(interval);
  }, [user?.id]);
  return records;
}
/** Everyone who can be found and added: registered accounts (verified or demo) plus the sample people. */
export function usePeople() {
  const { user } = useAuth();
  const [people, setPeople] = useState([]);
  useEffect(() => {
    let active = true;
    setPeople([]);
    if (!supabase || !user?.id) return () => { active = false; };
    supabase.from('profiles').select('id,username,full_name,created_at')
      .neq('id', user.id).order('created_at', { ascending: false }).then(({ data, error }) => {
        if (!active) return;
        if (error) { console.error('Could not load KNOXIA users:', error.message); return; }
        setPeople((data || []).filter(p => p.username).map(p => ({
          id: p.id, username: p.username,
          displayName: p.full_name || p.username, fullName: p.full_name || p.username,
          initials: (p.full_name || p.username).slice(0, 2).toUpperCase(),
          avatar: '', academic: '', createdAt: new Date(p.created_at || 0).getTime(),
          sample: false,
        })));
      });
    return () => { active = false; };
  }, [user?.id]);
  return people;
}

/** Everything the Friends screens need for the signed-in person. */
export function useFriends() {
  const me = useProfile(); const records = useFriendships(); const people = usePeople();
  const { user } = useAuth();
  return useMemo(() => {
    const byId = new Map(people.map((p) => [p.id, p]));
    const currentId = user?.id || me.id;
    const join = (list) => list.map((x) => ({ ...x, person: byId.get(x.otherId) })).filter((x) => x.person); // skips people who no longer exist
    return {
      me, meId: currentId, ready: !!currentId && loaded, error: loadError, records, people,
      friends: join(friendsOf(records, currentId)), incoming: join(incomingOf(records, currentId)), outgoing: join(outgoingOf(records, currentId)),
    };
  }, [me, records, people, user?.id]);
}

/** How the signed-in person stands with one other person, plus the request record between them, if any. */
export function useRelation(otherId) {
  const me = useProfile(); const { user } = useAuth(); const records = useFriendships();
  const myId = user?.id || me.id;
  return useMemo(() => {
    const rel = relation(records, myId, otherId);
    const record = rel === 'none' || rel === 'self' ? null : records.find((r) => r && ((r.from === myId && r.to === otherId) || (r.from === otherId && r.to === myId))) || null;
    return { me, rel, record };
  }, [me, myId, records, otherId]);
}

/** Number of friend requests waiting for the signed-in person (the badge in the sidebar). */
export function useIncomingCount() {
  const { user } = useAuth(); const records = useFriendships();
  return useMemo(() => (user?.id ? incomingOf(records, user.id).length : 0), [records, user?.id]);
}

/* ---------- Notifications ---------- */
// Notifications are saved per account under `knoxia-notes::<email>` (the key useUserData builds), so the
// other person's list can be written from here and shows up the next time they look.
const noteKey = (email) => `${KEYS.notes}::${emailKey(email)}`;
function notesOf(email) {
  const key = noteKey(email);
  return local.getRaw(key) !== null ? local.get(key, NONE, isList) : local.get(KEYS.notes, NOTES, isList); // same fallback as userData
}
export function addNote(email, note) {
  if (!email) return; const list = notesOf(email); if (list.some((n) => n.id === note.id)) return;
  local.set(noteKey(email), [{ ...note, read: false }, ...list].slice(0, 100));
}
export function dropNote(email, id) {
  if (!email) return; const list = notesOf(email); if (!list.some((n) => n.id === id)) return;
  local.set(noteKey(email), list.filter((n) => n.id !== id));
}
const requestNoteId = (recordId) => `fr-${recordId}-request`;

/* ---------- Supabase actions ---------- */
const done = async (action) => {
  try {
    await action();
    await refreshFriendships();
    return { ok: true };
  } catch (e) {
    return { error: e.message || 'Friend action failed.' };
  }
};
export const sendFriendRequest = (_me, person) => done(() => requestFriendship(person.id));
export const acceptFriendRequest = (_me, _person, id) => done(() => acceptFriendship(id));
export const declineFriendRequest = (_me, id) => done(() => declineFriendship(id));
export const cancelFriendRequest = (_me, _person, id) => done(() => cancelFriendshipRequest(id));
export const removeFriendship = (me, person) => {
  const record = remoteRecords.find(r => r.status === 'accepted' && (
    (r.from === (activeUser || me.id) && r.to === person.id) ||
    (r.to === (activeUser || me.id) && r.from === person.id)
  ));
  return record ? done(() => removeAcceptedFriendship(record.id)) : Promise.resolve({ error: 'Friendship not found.' });
};
