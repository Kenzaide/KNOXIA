/**
 * Study rooms and room messaging rules (Patches 20 and 21).
 *
 * Pure functions only: no storage, no React (tested by test/roomsCalc.test.mjs). Storage and hooks are in
 * `src/roomsStore.js`, the screens in `src/rooms.jsx`.
 *
 *   room    { id, name, topic, ownerId, memberIds: [], invitedIds: [], createdAt }
 *   message { id, roomId, authorId, text, at }
 *
 * People are identified by account id (or a sample person's id). Every room action returns
 * `{ rooms, ok?, error?, kind? }`; when `error` is set, `rooms` is unchanged and nothing should be saved.
 */
import { isSampleId } from './friendsCalc.js';

export const MAX_NAME = 40;
export const MAX_TOPIC = 60;
export const MAX_MEMBERS = 20;
export const MAX_MESSAGE = 500;
export const MAX_MESSAGES = 200; // kept per room; the oldest are dropped first

/* ---------- Demo data ---------- */
const ALEX = 'sample:alexrivera', MIKA = 'sample:mikas', JORDAN = 'sample:jordanlee';
const DAY = 86_400_000;
const T0 = Date.UTC(2026, 10, 15, 2, 0, 0); // fixed, so the demo conversation never changes between visits
export const SEED_ROOMS = [
  { id: 'r1', name: 'Machine Learning Review', topic: 'Supervised learning', ownerId: ALEX, memberIds: [ALEX, MIKA], invitedIds: [], createdAt: T0 - DAY },
  { id: 'r2', name: 'Automata Theory Study Group', topic: 'DFA and NFA', ownerId: JORDAN, memberIds: [JORDAN, ALEX], invitedIds: [], createdAt: T0 - DAY },
  { id: 'r3', name: 'Finals Preparation Room', topic: 'Mixed subjects', ownerId: MIKA, memberIds: [MIKA, ALEX, JORDAN], invitedIds: [], createdAt: T0 - 2 * DAY },
];
export const SEED_MESSAGES = [
  { id: 'm1', roomId: 'r1', authorId: ALEX, text: 'Anyone want to go through bias vs variance tonight?', at: T0 },
  { id: 'm2', roomId: 'r1', authorId: MIKA, text: 'Yes please. I keep mixing up underfitting and overfitting.', at: T0 + 4 * 60_000 },
  { id: 'm3', roomId: 'r2', authorId: JORDAN, text: 'Reminder: every NFA has an equivalent DFA. Try the subset construction.', at: T0 + 10 * 60_000 },
  { id: 'm4', roomId: 'r3', authorId: MIKA, text: 'Starting a 25-minute focus block.', at: T0 + 20 * 60_000 },
];

/* ---------- Shapes ---------- */
const ids = (v) => (Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === 'string' && x))] : []);
export const isRoom = (r) => !!r && typeof r === 'object' && typeof r.id === 'string' && !!r.id && typeof r.name === 'string' && !!r.name.trim()
  && typeof r.ownerId === 'string' && !!r.ownerId && Array.isArray(r.memberIds);
/** Saved data can be missing, corrupt or edited by hand: keep only well-formed rooms. The owner is always a member. */
export const cleanRooms = (rooms) => (Array.isArray(rooms) ? rooms : []).filter(isRoom).map((r) => {
  const memberIds = ids(r.memberIds); if (!memberIds.includes(r.ownerId)) memberIds.unshift(r.ownerId);
  return { ...r, topic: typeof r.topic === 'string' ? r.topic : '', memberIds, invitedIds: ids(r.invitedIds).filter((x) => !memberIds.includes(x)), createdAt: Number.isFinite(r.createdAt) ? r.createdAt : 0 };
});
export const isMessage = (m) => !!m && typeof m === 'object' && typeof m.id === 'string' && typeof m.roomId === 'string'
  && typeof m.authorId === 'string' && typeof m.text === 'string' && !!m.text.trim() && Number.isFinite(m.at);
export const cleanMessages = (messages) => (Array.isArray(messages) ? messages : []).filter(isMessage);

export const newRoomId = () => `room_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
export const newMessageId = () => `msg_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
export const cleanText = (s, max) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, max);

const fail = (rooms, error) => ({ rooms, error });
const find = (rooms, id) => rooms.find((r) => r.id === id) || null;
const change = (rooms, id, fn) => rooms.map((r) => (r.id === id ? fn(r) : r));

/* ---------- Lists ---------- */
export const isMember = (room, me) => !!room && !!me && room.memberIds.includes(me);
export const isInvited = (room, me) => !!room && !!me && room.invitedIds.includes(me);
export const isOwner = (room, me) => !!room && !!me && room.ownerId === me;
const newest = (a, b) => (b.createdAt - a.createdAt) || a.id.localeCompare(b.id);
export const myRooms = (rooms, me) => cleanRooms(rooms).filter((r) => isMember(r, me)).sort(newest);
export const invitesFor = (rooms, me) => cleanRooms(rooms).filter((r) => isInvited(r, me)).sort(newest);
export const otherRooms = (rooms, me) => cleanRooms(rooms).filter((r) => !isMember(r, me) && !isInvited(r, me)).sort(newest);
/** Friends who could still be invited to this room. */
export const invitable = (room, friendIds) => ids(friendIds).filter((id) => !isMember(room, id) && !isInvited(room, id));

/* ---------- Room actions ---------- */
export function createRoom(rooms, me, { name, topic } = {}, now = Date.now(), id = newRoomId()) {
  if (!me) return fail(rooms, 'Sign in to create a room.');
  const n = cleanText(name, MAX_NAME); if (!n) return fail(rooms, 'Give the room a name.');
  const room = { id, name: n, topic: cleanText(topic, MAX_TOPIC) || 'Open study', ownerId: me, memberIds: [me], invitedIds: [], createdAt: now };
  return { rooms: [room, ...cleanRooms(rooms)], ok: true, room };
}
export function joinRoom(rooms, me, roomId) {
  const list = cleanRooms(rooms); const r = find(list, roomId);
  if (!me) return fail(rooms, 'Sign in to join a room.');
  if (!r) return fail(rooms, 'That room no longer exists.');
  if (isMember(r, me)) return fail(rooms, 'You are already in this room.');
  if (r.memberIds.length >= MAX_MEMBERS) return fail(rooms, `This room is full (${MAX_MEMBERS} people).`);
  return { rooms: change(list, roomId, (x) => ({ ...x, memberIds: [...x.memberIds, me], invitedIds: x.invitedIds.filter((i) => i !== me) })), ok: true };
}
/** The owner cannot leave (delete the room instead), so a room is never left without one. */
export function leaveRoom(rooms, me, roomId) {
  const list = cleanRooms(rooms); const r = find(list, roomId);
  if (!r) return fail(rooms, 'That room no longer exists.');
  if (!isMember(r, me)) return fail(rooms, 'You are not in this room.');
  if (isOwner(r, me)) return fail(rooms, 'You created this room, so delete it instead of leaving.');
  return { rooms: change(list, roomId, (x) => ({ ...x, memberIds: x.memberIds.filter((i) => i !== me) })), ok: true };
}
export function deleteRoom(rooms, me, roomId) {
  const list = cleanRooms(rooms); const r = find(list, roomId);
  if (!r) return fail(rooms, 'That room no longer exists.');
  if (!isOwner(r, me)) return fail(rooms, 'Only the person who created the room can delete it.');
  return { rooms: list.filter((x) => x.id !== roomId), ok: true };
}

/* ---------- Invites and participants ---------- */
/** A member invites a friend. `friendIds` are the inviter's friends: only friends can be invited. Sample people join straight away. */
export function inviteToRoom(rooms, me, roomId, otherId, friendIds = []) {
  const list = cleanRooms(rooms); const r = find(list, roomId);
  if (!r) return fail(rooms, 'That room no longer exists.');
  if (!isMember(r, me)) return fail(rooms, 'Join the room before inviting people.');
  if (!otherId || otherId === me) return fail(rooms, 'Pick a friend to invite.');
  if (!friendIds.includes(otherId)) return fail(rooms, 'You can only invite your friends.');
  if (isMember(r, otherId)) return fail(rooms, 'They are already in this room.');
  if (isInvited(r, otherId)) return fail(rooms, 'They already have an invite.');
  if (r.memberIds.length >= MAX_MEMBERS) return fail(rooms, `This room is full (${MAX_MEMBERS} people).`);
  if (isSampleId(otherId)) return { rooms: change(list, roomId, (x) => ({ ...x, memberIds: [...x.memberIds, otherId] })), ok: true, kind: 'joined' };
  return { rooms: change(list, roomId, (x) => ({ ...x, invitedIds: [...x.invitedIds, otherId] })), ok: true, kind: 'invited' };
}
export function acceptInvite(rooms, me, roomId) {
  const r = find(cleanRooms(rooms), roomId);
  if (!r) return fail(rooms, 'That room no longer exists.');
  if (!isInvited(r, me)) return fail(rooms, 'You do not have an invite to this room.');
  return joinRoom(rooms, me, roomId);
}
export function declineInvite(rooms, me, roomId) {
  const list = cleanRooms(rooms); const r = find(list, roomId);
  if (!r || !isInvited(r, me)) return fail(rooms, 'You do not have an invite to this room.');
  return { rooms: change(list, roomId, (x) => ({ ...x, invitedIds: x.invitedIds.filter((i) => i !== me) })), ok: true };
}
/** Only the owner can remove a member (or withdraw a pending invite). */
export function removeFromRoom(rooms, me, roomId, otherId) {
  const list = cleanRooms(rooms); const r = find(list, roomId);
  if (!r) return fail(rooms, 'That room no longer exists.');
  if (!isOwner(r, me)) return fail(rooms, 'Only the person who created the room can remove people.');
  if (otherId === me) return fail(rooms, 'You cannot remove yourself. Delete the room instead.');
  if (!isMember(r, otherId) && !isInvited(r, otherId)) return fail(rooms, 'They are not in this room.');
  return { rooms: change(list, roomId, (x) => ({ ...x, memberIds: x.memberIds.filter((i) => i !== otherId), invitedIds: x.invitedIds.filter((i) => i !== otherId) })), ok: true };
}

/* ---------- Messages ---------- */
/** Oldest first, so a conversation reads top to bottom. */
export const messagesOf = (messages, roomId) => cleanMessages(messages).filter((m) => m.roomId === roomId).sort((a, b) => (a.at - b.at) || a.id.localeCompare(b.id));
export const lastMessage = (messages, roomId) => { const l = messagesOf(messages, roomId); return l[l.length - 1] || null; };
/** Only members of the room can post. Messages are plain text, whitespace is tidied and the length is capped. */
export function sendMessage(messages, rooms, me, roomId, text, now = Date.now(), id = newMessageId()) {
  const r = find(cleanRooms(rooms), roomId); const t = cleanText(text, MAX_MESSAGE);
  if (!r) return fail(messages, 'That room no longer exists.');
  if (!isMember(r, me)) return fail(messages, 'Join the room to send messages.');
  if (!t) return fail(messages, 'Type a message first.');
  const message = { id, roomId, authorId: me, text: t, at: now };
  const all = [...cleanMessages(messages), message];
  const mine = all.filter((m) => m.roomId === roomId).sort((a, b) => a.at - b.at); // keep only the newest MAX_MESSAGES of this room
  const drop = new Set(mine.slice(0, Math.max(0, mine.length - MAX_MESSAGES)).map((m) => m.id));
  return { messages: all.filter((m) => !drop.has(m.id)), ok: true, message };
}
/** You can delete your own messages, and the room owner can delete anyone's. */
export function deleteMessage(messages, rooms, me, messageId) {
  const list = cleanMessages(messages); const m = list.find((x) => x.id === messageId);
  if (!m) return fail(messages, 'That message no longer exists.');
  const r = find(cleanRooms(rooms), m.roomId);
  if (m.authorId !== me && !isOwner(r, me)) return fail(messages, 'You can only delete your own messages.');
  return { messages: list.filter((x) => x.id !== messageId), ok: true };
}
/** When a room is deleted its conversation goes with it. */
export const dropRoomMessages = (messages, roomId) => cleanMessages(messages).filter((m) => m.roomId !== roomId);
