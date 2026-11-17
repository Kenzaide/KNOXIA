// Run with: npm test  (Node's built-in test runner, no extra packages)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SEED_ROOMS, SEED_MESSAGES, MAX_MEMBERS, MAX_MESSAGE, MAX_MESSAGES, cleanRooms, createRoom, joinRoom, leaveRoom, deleteRoom,
  inviteToRoom, acceptInvite, declineInvite, removeFromRoom, myRooms, invitesFor, otherRooms, invitable,
  messagesOf, lastMessage, sendMessage, deleteMessage, dropRoomMessages,
} from '../src/roomsCalc.js';

const mk = (rooms = []) => createRoom(rooms, 'ana', { name: '  Calculus   group ', topic: '' }, 1000, 'r1');

test('createRoom tidies the name, defaults the topic, makes the creator owner and member', () => {
  const out = mk();
  assert.equal(out.ok, true);
  assert.deepEqual(out.room, { id: 'r1', name: 'Calculus group', topic: 'Open study', ownerId: 'ana', memberIds: ['ana'], invitedIds: [], createdAt: 1000 });
  assert.match(createRoom([], 'ana', { name: '   ' }).error, /name/);
  assert.match(createRoom([], '', { name: 'x' }).error, /Sign in/);
  assert.equal(createRoom([], 'ana', { name: 'x'.repeat(100) }).room.name.length, 40);
});

test('joinRoom adds a member once, and respects the size limit', () => {
  const { rooms } = mk();
  const j = joinRoom(rooms, 'ben', 'r1'); assert.deepEqual(j.rooms[0].memberIds, ['ana', 'ben']);
  assert.match(joinRoom(j.rooms, 'ben', 'r1').error, /already/);
  assert.match(joinRoom(rooms, 'ben', 'nope').error, /no longer/);
  const full = [{ ...rooms[0], memberIds: Array.from({ length: MAX_MEMBERS }, (_, i) => 'u' + i).concat([]) , ownerId: 'u0' }];
  assert.match(joinRoom(full, 'ben', 'r1').error, /full/);
});

test('leaveRoom works for members but not the owner; deleteRoom is owner only', () => {
  const { rooms } = mk(); const j = joinRoom(rooms, 'ben', 'r1').rooms;
  assert.deepEqual(leaveRoom(j, 'ben', 'r1').rooms[0].memberIds, ['ana']);
  assert.match(leaveRoom(j, 'ana', 'r1').error, /delete/);
  assert.match(leaveRoom(j, 'cy', 'r1').error, /not in/);
  assert.match(deleteRoom(j, 'ben', 'r1').error, /Only/);
  assert.deepEqual(deleteRoom(j, 'ana', 'r1').rooms, []);
});

test('inviteToRoom: members invite friends only; sample friends join straight away', () => {
  const { rooms } = mk();
  const inv = inviteToRoom(rooms, 'ana', 'r1', 'ben', ['ben']);
  assert.equal(inv.kind, 'invited'); assert.deepEqual(inv.rooms[0].invitedIds, ['ben']);
  assert.match(inviteToRoom(rooms, 'ana', 'r1', 'ben', []).error, /friends/);
  assert.match(inviteToRoom(rooms, 'zed', 'r1', 'ben', ['ben']).error, /Join the room/);
  assert.match(inviteToRoom(inv.rooms, 'ana', 'r1', 'ben', ['ben']).error, /already have/);
  const s = inviteToRoom(rooms, 'ana', 'r1', 'sample:mikas', ['sample:mikas']);
  assert.equal(s.kind, 'joined'); assert.deepEqual(s.rooms[0].memberIds, ['ana', 'sample:mikas']);
});

test('acceptInvite joins and clears the invite; declineInvite just clears it', () => {
  const invited = inviteToRoom(mk().rooms, 'ana', 'r1', 'ben', ['ben']).rooms;
  const a = acceptInvite(invited, 'ben', 'r1'); assert.deepEqual(a.rooms[0].memberIds, ['ana', 'ben']); assert.deepEqual(a.rooms[0].invitedIds, []);
  assert.match(acceptInvite(invited, 'cy', 'r1').error, /do not have/);
  const d = declineInvite(invited, 'ben', 'r1'); assert.deepEqual(d.rooms[0].invitedIds, []); assert.deepEqual(d.rooms[0].memberIds, ['ana']);
});

test('removeFromRoom is owner only, cannot remove yourself, and withdraws pending invites', () => {
  let rooms = joinRoom(mk().rooms, 'ben', 'r1').rooms; rooms = inviteToRoom(rooms, 'ana', 'r1', 'cy', ['cy']).rooms;
  assert.match(removeFromRoom(rooms, 'ben', 'r1', 'ana').error, /Only/);
  assert.match(removeFromRoom(rooms, 'ana', 'r1', 'ana').error, /yourself/);
  assert.deepEqual(removeFromRoom(rooms, 'ana', 'r1', 'ben').rooms[0].memberIds, ['ana']);
  assert.deepEqual(removeFromRoom(rooms, 'ana', 'r1', 'cy').rooms[0].invitedIds, []);
  assert.match(removeFromRoom(rooms, 'ana', 'r1', 'zed').error, /not in/);
});

test('room lists and invitable friends', () => {
  const rooms = inviteToRoom(mk().rooms, 'ana', 'r1', 'cy', ['cy']).rooms.concat(SEED_ROOMS);
  assert.deepEqual(myRooms(rooms, 'ana').map((r) => r.id), ['r1']);
  assert.deepEqual(invitesFor(rooms, 'cy').map((r) => r.id), ['r1']);
  assert.equal(otherRooms(rooms, 'ana').length, SEED_ROOMS.length);
  assert.deepEqual(invitable(rooms[0], ['ana', 'cy', 'dee']), ['dee']);
});

test('cleanRooms drops malformed rooms, always keeps the owner as a member and invites exclude members', () => {
  const out = cleanRooms([null, { id: 'x' }, { id: 'a', name: 'A', ownerId: 'o', memberIds: ['m', 'm'], invitedIds: ['m', 'i'] }]);
  assert.equal(out.length, 1); assert.deepEqual(out[0].memberIds, ['o', 'm']); assert.deepEqual(out[0].invitedIds, ['i']);
  assert.deepEqual(cleanRooms('nope'), []);
});

test('sendMessage: members only, trims, caps length, stores author and time', () => {
  const { rooms } = mk(); const out = sendMessage([], rooms, 'ana', 'r1', '  hello   there ', 5000, 'm1');
  assert.deepEqual(out.messages, [{ id: 'm1', roomId: 'r1', authorId: 'ana', text: 'hello there', at: 5000 }]);
  assert.match(sendMessage([], rooms, 'ben', 'r1', 'hi').error, /Join the room/);
  assert.match(sendMessage([], rooms, 'ana', 'r1', '   ').error, /Type a message/);
  assert.match(sendMessage([], rooms, 'ana', 'nope', 'hi').error, /no longer/);
  assert.equal(sendMessage([], rooms, 'ana', 'r1', 'x'.repeat(MAX_MESSAGE + 50)).message.text.length, MAX_MESSAGE);
});

test('messagesOf returns one room oldest first; lastMessage is the newest; old messages are trimmed per room', () => {
  const { rooms } = mk();
  let msgs = [{ id: 'b', roomId: 'r1', authorId: 'ana', text: 'two', at: 20 }, { id: 'a', roomId: 'r1', authorId: 'ana', text: 'one', at: 10 }, { id: 'z', roomId: 'other', authorId: 'ana', text: 'x', at: 5 }];
  assert.deepEqual(messagesOf(msgs, 'r1').map((m) => m.text), ['one', 'two']);
  assert.equal(lastMessage(msgs, 'r1').text, 'two'); assert.equal(lastMessage(msgs, 'none'), null);
  msgs = [];
  for (let i = 0; i < MAX_MESSAGES + 5; i++) msgs = sendMessage(msgs, rooms, 'ana', 'r1', 'm' + i, 100 + i, 'id' + i).messages;
  const kept = messagesOf(msgs, 'r1'); assert.equal(kept.length, MAX_MESSAGES); assert.equal(kept[0].text, 'm5');
});

test('deleteMessage: authors delete their own, the room owner can delete any, others cannot', () => {
  let { rooms } = mk(); rooms = joinRoom(rooms, 'ben', 'r1').rooms;
  const msgs = [{ id: 'm1', roomId: 'r1', authorId: 'ben', text: 'hi', at: 1 }, { id: 'm2', roomId: 'r1', authorId: 'ana', text: 'yo', at: 2 }];
  assert.deepEqual(deleteMessage(msgs, rooms, 'ben', 'm1').messages.map((m) => m.id), ['m2']);
  assert.match(deleteMessage(msgs, rooms, 'ben', 'm2').error, /own/);
  assert.deepEqual(deleteMessage(msgs, rooms, 'ana', 'm1').messages.map((m) => m.id), ['m2']);
  assert.match(deleteMessage(msgs, rooms, 'ana', 'gone').error, /no longer/);
});

test('dropRoomMessages removes only that room, and the demo data is well-formed', () => {
  const msgs = [{ id: 'a', roomId: 'r1', authorId: 'x', text: 't', at: 1 }, { id: 'b', roomId: 'r2', authorId: 'x', text: 't', at: 2 }];
  assert.deepEqual(dropRoomMessages(msgs, 'r1').map((m) => m.id), ['b']);
  assert.equal(cleanRooms(SEED_ROOMS).length, SEED_ROOMS.length);
  assert.ok(SEED_MESSAGES.every((m) => SEED_ROOMS.some((r) => r.id === m.roomId)));
});
