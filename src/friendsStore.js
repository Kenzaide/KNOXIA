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
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { local } from './storage.js';
import { useProfile, emailKey } from './accounts.js';
import { useAuth } from './session.js';
import { supabase } from './lib/supabase.js';
import { KEYS, NOTES } from './data.js';
import {
  SAMPLE_PEOPLE, relation, friendsOf, incomingOf, outgoingOf,
  requestFriend, acceptRequest, declineRequest, cancelRequest, removeFriend,
} from './friendsCalc.js';

export const FRIENDS_KEY = 'knoxia-friendships';
const NONE = []; // one shared empty list, so React sees an unchanged snapshot while nothing is saved
const isList = Array.isArray;
const saved = () => local.get(FRIENDS_KEY, NONE, isList);

/** Every friendship record, shared by all accounts in this browser. Re-renders on any change (also from another tab). */
export function useFriendships() {
  const subscribe = useCallback((fn) => local.subscribe(FRIENDS_KEY, fn), []);
  return useSyncExternalStore(subscribe, saved, () => NONE);
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
  // Sessions from before accounts existed have no account to attach friends to yet: create it once.
  const { user } = useAuth();
  return useMemo(() => {
    const byId = new Map(people.map((p) => [p.id, p]));
    const currentId = user?.id || me.id;
    const join = (list) => list.map((x) => ({ ...x, person: byId.get(x.otherId) })).filter((x) => x.person); // skips people who no longer exist
    return {
      me, meId: currentId, ready: !!currentId, records, people,
      friends: join(friendsOf(records, currentId)), incoming: join(incomingOf(records, currentId)), outgoing: join(outgoingOf(records, currentId)),
    };
  }, [me, records, people, user?.id]);
}

/** How the signed-in person stands with one other person, plus the request record between them, if any. */
export function useRelation(otherId) {
  const me = useProfile(); const records = useFriendships();
  return useMemo(() => {
    const rel = relation(records, me.id, otherId);
    const record = rel === 'none' || rel === 'self' ? null : records.find((r) => r && ((r.from === me.id && r.to === otherId) || (r.from === otherId && r.to === me.id))) || null;
    return { me, rel, record };
  }, [me, records, otherId]);
}

/** Number of friend requests waiting for the signed-in person (the badge in the sidebar). */
export function useIncomingCount() {
  const me = useProfile(); const records = useFriendships();
  return useMemo(() => (me.id ? incomingOf(records, me.id).length : 0), [records, me.id]);
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

/* ---------- Actions ---------- */
// Each one reads the latest saved records, applies one rule from friendsCalc.js and saves only when it worked.
function apply(fn) { const out = fn(saved()); if (out.ok) local.set(FRIENDS_KEY, out.records); return out; }
const who = (p) => (p && p.displayName) || 'Someone';

/** `me` asks `person` to be friends. Resolves like requestFriend: { ok, kind: 'sent' | 'accepted' } or { error }. */
export function sendFriendRequest(me, person) {
  const out = apply((r) => requestFriend(r, me.id, person.id));
  if (!out.ok) return out;
  if (out.kind === 'sent') addNote(person.email, { id: requestNoteId(out.record.id), t: `${who(me)} sent you a friend request`, s: 'Open Requests to accept or decline.', to: '/friends?tab=requests' });
  else { // the other person had asked first (or is a sample person): the request they sent is settled, tell them
    dropNote(me.email, requestNoteId(out.record.id));
    addNote(person.email, { id: `fr-${out.record.id}-accepted`, t: `${who(me)} accepted your friend request`, s: 'You are now friends.', to: '/friends' });
  }
  return out;
}
export function acceptFriendRequest(me, person, requestId) {
  const out = apply((r) => acceptRequest(r, me.id, requestId));
  if (out.ok) {
    dropNote(me.email, requestNoteId(requestId)); // answered, so it no longer needs your attention
    addNote(person.email, { id: `fr-${requestId}-accepted`, t: `${who(me)} accepted your friend request`, s: 'You are now friends.', to: '/friends' });
  }
  return out;
}
export function declineFriendRequest(me, requestId) {
  const out = apply((r) => declineRequest(r, me.id, requestId));
  if (out.ok) dropNote(me.email, requestNoteId(requestId));
  return out;
}
export function cancelFriendRequest(me, person, requestId) {
  const out = apply((r) => cancelRequest(r, me.id, requestId));
  if (out.ok) dropNote(person.email, requestNoteId(requestId)); // the request no longer exists, so its notification goes too
  return out;
}
export const removeFriendship = (me, person) => apply((r) => removeFriend(r, me.id, person.id));
