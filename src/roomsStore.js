/**
 * Study room storage and hooks (Patches 20 and 21). The rules are in `src/roomsCalc.js`.
 *
 * FRONTEND-ONLY DEMO: rooms and messages are saved in this browser's localStorage under two shared keys, so
 * accounts registered in the same browser see the same rooms (open a second tab and sign in as another person
 * to try an invite). Anyone using the browser can edit them: a real backend must check who is a member before
 * returning or accepting messages.
 *
 * Swapping in a backend later: keep the exported function names and make them call your API.
 */
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { local } from './storage.js';
import { useProfile } from './accounts.js';
import { useFriends, addNote, dropNote } from './friendsStore.js';
import {
  SEED_ROOMS, SEED_MESSAGES, cleanRooms, cleanMessages, createRoom, joinRoom, leaveRoom, deleteRoom,
  inviteToRoom, acceptInvite, declineInvite, removeFromRoom, sendMessage, deleteMessage, dropRoomMessages,
} from './roomsCalc.js';
import { dropRoomActivities } from './activitiesCalc.js';

export const ROOMS_KEY = 'knoxia-study-rooms';
export const MESSAGES_KEY = 'knoxia-room-messages';
export const ACTIVITIES_KEY = 'knoxia-room-activities'; // group study activities (Patch 22), see activitiesStore.js
const isList = Array.isArray;
export const savedRooms = () => local.get(ROOMS_KEY, [], isList);        // the demo rooms until the first change is saved
const savedMessages = () => local.get(MESSAGES_KEY, [], isList);

function useShared(key, read, server) {
  const subscribe = useCallback((fn) => local.subscribe(key, fn), [key]);
  return useSyncExternalStore(subscribe, read, () => server);
}

/** Everything the room screens need for the signed-in person. Re-renders on any change, also from another tab. */
export function useRoomsData() {
  const me = useProfile(); const f = useFriends();
  const rawRooms = useShared(ROOMS_KEY, savedRooms, []); const rawMessages = useShared(MESSAGES_KEY, savedMessages, []);
  return useMemo(() => ({
    me, meId: me.id, ready: f.ready,
    rooms: cleanRooms(rawRooms), messages: cleanMessages(rawMessages),
    people: new Map(f.people.map((p) => [p.id, p])),
    friends: f.friends.map((x) => x.person),
  }), [me, f.ready, f.people, f.friends, rawRooms, rawMessages]);
}

const inviteNoteId = (roomId, personId) => `room-${roomId}-invite-${personId}`;
const who = (p) => (p && p.displayName) || 'Someone';

/* ---------- Actions ---------- */
// Each one reads the latest saved data, applies one rule from roomsCalc.js and saves only when it worked.
function applyRooms(fn) { const out = fn(savedRooms()); if (out.ok) local.set(ROOMS_KEY, out.rooms); return out; }

export function createStudyRoom(me, fields) { return applyRooms((r) => createRoom(r, me.id, fields)); }
export function joinStudyRoom(me, roomId) { return applyRooms((r) => joinRoom(r, me.id, roomId)); }
export const leaveStudyRoom = (me, roomId) => applyRooms((r) => leaveRoom(r, me.id, roomId));
export function deleteStudyRoom(me, roomId) {
  const out = applyRooms((r) => deleteRoom(r, me.id, roomId));
  if (out.ok) { // the room's conversation and activities go with it
    local.set(MESSAGES_KEY, dropRoomMessages(savedMessages(), roomId));
    local.set(ACTIVITIES_KEY, dropRoomActivities(local.get(ACTIVITIES_KEY, [], Array.isArray), roomId));
  }
  return out;
}
export function inviteFriend(me, room, person, friendIds) {
  const out = applyRooms((r) => inviteToRoom(r, me.id, room.id, person.id, friendIds));
  if (out.ok && out.kind === 'invited') addNote(person.email, { id: inviteNoteId(room.id, person.id), t: `${who(me)} invited you to “${room.name}”`, s: 'Open Study Rooms to join.', to: '/study-rooms' });
  return out;
}
export function acceptRoomInvite(me, roomId) {
  const out = applyRooms((r) => acceptInvite(r, me.id, roomId));
  if (out.ok) dropNote(me.email, inviteNoteId(roomId, me.id));
  return out;
}
export function declineRoomInvite(me, roomId) {
  const out = applyRooms((r) => declineInvite(r, me.id, roomId));
  if (out.ok) dropNote(me.email, inviteNoteId(roomId, me.id));
  return out;
}
export function removePerson(room, person, me) {
  const out = applyRooms((r) => removeFromRoom(r, me.id, room.id, person.id));
  if (out.ok) dropNote(person.email, inviteNoteId(room.id, person.id)); // a withdrawn invite should not linger
  return out;
}

export function postMessage(me, roomId, text) {
  const out = sendMessage(savedMessages(), savedRooms(), me.id, roomId, text);
  if (out.ok) local.set(MESSAGES_KEY, out.messages);
  return out;
}
export function removeMessage(me, messageId) {
  const out = deleteMessage(savedMessages(), savedRooms(), me.id, messageId);
  if (out.ok) local.set(MESSAGES_KEY, out.messages);
  return out;
}
