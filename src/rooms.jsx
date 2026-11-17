/**
 * Study rooms screens (Patches 20 and 21): the room list (create, join, invitations), and a room with its
 * conversation, focus timer, participants and invites. Rules are in roomsCalc.js, storage and hooks in roomsStore.js.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Plus, Users, Send, Play, Pause, RotateCcw, Trash2, LogOut, UserPlus, UserX, Check, X, Crown } from 'lucide-react';
import { UserAvatar } from './profile.jsx';
import { Button, SectionTitle, ConfirmDialog, PageSkeleton } from './ui.jsx';
import { toast } from './materials.jsx';
import {
  MAX_NAME, MAX_TOPIC, MAX_MESSAGE, myRooms, invitesFor, otherRooms, invitable, isMember, isInvited, isOwner, messagesOf, lastMessage,
} from './roomsCalc.js';
import { GroupActivities } from './activities.jsx';
import {
  useRoomsData, createStudyRoom, joinStudyRoom, leaveStudyRoom, deleteStudyRoom, inviteFriend,
  acceptRoomInvite, declineRoomInvite, removePerson, postMessage, removeMessage,
} from './roomsStore.js';

const run = (out, okMsg) => { if (out.error) toast(out.error); else if (okMsg) toast(okMsg); return !out.error; };
const stamp = (at) => {
  const d = new Date(at); const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString() ? time : `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${time}`;
};
const nameOf = (data, id) => (data.people.get(id) || {}).displayName || 'Former member';
const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function RoomCard({ room, data, action }) {
  const last = lastMessage(data.messages, room.id);
  return <div className="panel friend-card room-card">
    <div className="stat-icon" style={{ margin: '0 auto 10px' }}><Users size={18} /></div>
    <h3>{room.name}</h3><p>{room.topic}</p>
    <span className="friend-status">{count(room.memberIds.length, 'person', 'people')}</span>
    {last && <small className="room-last">{nameOf(data, last.authorId) === data.me.displayName ? 'You' : nameOf(data, last.authorId)}: {last.text}</small>}
    {action}
  </div>;
}

export function StudyRooms() {
  const data = useRoomsData(); const nav = useNavigate();
  const [open, setOpen] = useState(false); const [name, setName] = useState(''); const [topic, setTopic] = useState('');
  if (!data.ready) return <PageSkeleton cards />;
  const mine = myRooms(data.rooms, data.meId); const invites = invitesFor(data.rooms, data.meId); const others = otherRooms(data.rooms, data.meId);

  const create = (e) => {
    e.preventDefault(); const out = createStudyRoom(data.me, { name, topic });
    if (run(out, 'Room created')) { setName(''); setTopic(''); setOpen(false); nav('/study-rooms/' + out.room.id); }
  };
  const join = (r) => { if (run(joinStudyRoom(data.me, r.id), `You joined ${r.name}`)) nav('/study-rooms/' + r.id); };

  return <>
    <SectionTitle title="Study Rooms" subtitle="Study together, stay focused." action={<Button icon={Plus} onClick={() => setOpen(!open)}>Create a room</Button>} />
    {open && <form className="panel room-form" onSubmit={create}>
      <input autoFocus aria-label="Room name" placeholder="Room name" maxLength={MAX_NAME} value={name} onChange={(e) => setName(e.target.value)} />
      <input aria-label="Topic (optional)" placeholder="Topic (optional)" maxLength={MAX_TOPIC} value={topic} onChange={(e) => setTopic(e.target.value)} />
      <Button type="submit">Create room</Button>
    </form>}

    {invites.length > 0 && <div className="panel room-invites"><h3>Invitations</h3>
      {invites.map((r) => <div className="friend-row" key={r.id}>
        <div className="stat-icon"><Users size={16} /></div>
        <div><b>{r.name}</b><small>{r.topic} · {count(r.memberIds.length, 'person', 'people')}</small></div>
        <button type="button" className="small-outline" onClick={() => run(acceptRoomInvite(data.me, r.id), `You joined ${r.name}`)} aria-label={`Accept invite to ${r.name}`}><Check size={14} /></button>
        <button type="button" className="small-outline" onClick={() => run(declineRoomInvite(data.me, r.id), 'Invite declined')} aria-label={`Decline invite to ${r.name}`}><X size={14} /></button>
      </div>)}
    </div>}

    <h3 className="room-heading">Your rooms</h3>
    {mine.length === 0
      ? <div className="empty-state"><Users size={32} /><b>You are not in any room yet</b><p>Create a room, or join one below.</p></div>
      : <div className="friend-grid">{mine.map((r) => <RoomCard key={r.id} room={r} data={data} action={<Button variant="soft" onClick={() => nav('/study-rooms/' + r.id)}>Open room</Button>} />)}</div>}

    {others.length > 0 && <>
      <h3 className="room-heading">Open rooms</h3>
      <div className="friend-grid">{others.map((r) => <RoomCard key={r.id} room={r} data={data} action={<Button variant="outline" onClick={() => join(r)}>Join room</Button>} />)}</div>
    </>}
  </>;
}

/* ---------- One room ---------- */
function FocusTimer() {
  const [sec, setSec] = useState(1500); const [on, setOn] = useState(false);
  useEffect(() => { if (!on) return; const t = setInterval(() => setSec((s) => { if (s <= 1) { setOn(false); return 0; } return s - 1; }), 1000); return () => clearInterval(t); }, [on]);
  return <div className="panel" style={{ textAlign: 'center' }}><h3>Focus timer</h3>
    <h1 style={{ fontSize: 44, margin: '8px 0' }}>{String(Math.floor(sec / 60)).padStart(2, '0')}:{String(sec % 60).padStart(2, '0')}</h1>
    <div className="friend-buttons"><Button icon={on ? Pause : Play} onClick={() => setOn(!on)}>{on ? 'Pause' : 'Start'}</Button><Button variant="outline" icon={RotateCcw} onClick={() => { setOn(false); setSec(1500); }}>Reset</Button></div></div>;
}

function Conversation({ room, data }) {
  const [text, setText] = useState(''); const end = useRef(null);
  const list = messagesOf(data.messages, room.id); const owner = isOwner(room, data.meId);
  useEffect(() => { if (end.current && end.current.scrollIntoView) end.current.scrollIntoView({ block: 'end' }); }, [list.length]);
  const send = () => { if (!text.trim()) return; if (run(postMessage(data.me, room.id, text))) setText(''); };
  return <div className="chat-main panel room-chat">
    <div className="chat-messages" role="log" aria-label="Room messages">
      {list.length === 0 && <p className="muted" role="status">No messages yet. Say hello to start the conversation.</p>}
      {list.map((m) => { const mine = m.authorId === data.meId; const person = data.people.get(m.authorId);
        return <div className={`message ${mine ? 'user' : 'assistant'}`} key={m.id}>
          {!mine && (person ? <UserAvatar profile={person} size="xs" /> : <div className="mini-avatar">?</div>)}
          <div>
            <div className="bubble">{m.text}</div>
            <small className="msg-meta">{mine ? 'You' : nameOf(data, m.authorId)} · {stamp(m.at)}
              {(mine || owner) && <button type="button" className="link-btn" aria-label="Delete message" onClick={() => run(removeMessage(data.me, m.id))}><Trash2 size={12} /></button>}
            </small>
          </div>
        </div>; })}
      <div ref={end} />
    </div>
    <div className="chat-input">
      <input aria-label="Message" placeholder="Message the room…" maxLength={MAX_MESSAGE} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
      <button type="button" className="send-btn" aria-label="Send" onClick={send}><Send size={18} /></button>
    </div>
  </div>;
}

function People({ room, data }) {
  const owner = isOwner(room, data.meId); const [pick, setPick] = useState(false);
  const canInvite = invitable(room, data.friends.map((p) => p.id)).map((id) => data.people.get(id)).filter(Boolean);
  const invited = room.invitedIds.map((id) => data.people.get(id)).filter(Boolean);
  const row = (p, note, remove) => <div className="friend-row" key={p.id}>
    <UserAvatar profile={p} size="sm" />
    <div><b>{p.displayName}</b><small>{note}</small></div>
    {remove && <button type="button" className="link-btn" aria-label={`Remove ${p.displayName}`} onClick={() => run(removePerson(room, p, data.me), `${p.displayName} was removed`)}><UserX size={15} /></button>}
  </div>;
  return <div className="panel"><h3>In this room ({room.memberIds.length})</h3>
    {room.memberIds.map((id) => { const p = data.people.get(id); return p ? row(p, id === room.ownerId ? 'Host' : `@${p.username}`, owner && id !== data.meId) : null; })}
    {invited.length > 0 && <><p className="fr-sub">Invited</p>{invited.map((p) => row(p, 'Waiting to join', owner))}</>}
    <div style={{ marginTop: 12 }}>
      <Button variant="outline" icon={UserPlus} onClick={() => setPick(!pick)}>Invite a friend</Button>
      {pick && (canInvite.length === 0
        ? <p className="muted-sm" role="status">No friends to invite. <Link to="/friends?tab=find">Find friends</Link>, or they are already here.</p>
        : canInvite.map((p) => <div className="friend-row" key={p.id}><UserAvatar profile={p} size="sm" /><div><b>{p.displayName}</b></div>
          <button type="button" className="small-outline" onClick={() => run(inviteFriend(data.me, room, p, data.friends.map((x) => x.id)), p.sample ? `${p.displayName} joined the room` : `Invite sent to ${p.displayName}`)}>Invite</button></div>))}
    </div>
  </div>;
}

export function RoomDetail() {
  const { id } = useParams(); const nav = useNavigate(); const data = useRoomsData(); const [dlg, setDlg] = useState(null);
  if (!data.ready) return <PageSkeleton />;
  const room = data.rooms.find((r) => r.id === id);
  if (!room) return <div className="empty-state"><Users size={32} /><b>Room not found</b><p>It may have been closed.</p><Button onClick={() => nav('/study-rooms')}>Back to study rooms</Button></div>;
  const member = isMember(room, data.meId); const owner = isOwner(room, data.meId); const invited = isInvited(room, data.meId);

  if (!member) return <>
    <SectionTitle title={room.name} subtitle={room.topic} action={<Button variant="outline" onClick={() => nav('/study-rooms')}>Back</Button>} />
    <div className="empty-state panel"><Users size={32} /><b>{invited ? 'You have been invited to this room' : 'Join this room to take part'}</b>
      <p>{count(room.memberIds.length, 'person is', 'people are')} studying here. The conversation is visible to members only.</p>
      <Button onClick={() => run(joinStudyRoom(data.me, room.id), `You joined ${room.name}`)}>{invited ? 'Accept invite' : 'Join room'}</Button></div>
  </>;

  const leave = () => { setDlg(null); if (run(leaveStudyRoom(data.me, room.id), `You left ${room.name}`)) nav('/study-rooms'); };
  const del = () => { setDlg(null); if (run(deleteStudyRoom(data.me, room.id), 'Room deleted')) nav('/study-rooms'); };
  return <>
    <SectionTitle title={room.name} subtitle={`${room.topic} · hosted by ${nameOf(data, room.ownerId)}`}
      action={owner ? <Button variant="outline" icon={Trash2} onClick={() => setDlg('delete')}>Delete room</Button> : <Button variant="outline" icon={LogOut} onClick={() => setDlg('leave')}>Leave room</Button>} />
    <div className="chat-layout">
      <Conversation room={room} data={data} />
      <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}><FocusTimer /><People room={room} data={data} /></div>
    </div>
    <GroupActivities room={room} data={data} />
    {dlg === 'leave' && <ConfirmDialog icon={LogOut} title={`Leave ${room.name}?`} body="You can join again later. Your earlier messages stay in the conversation." confirmLabel="Leave" onConfirm={leave} onCancel={() => setDlg(null)} />}
    {dlg === 'delete' && <ConfirmDialog icon={Trash2} title={`Delete ${room.name}?`} body="This removes the room and its whole conversation for everyone. This can't be undone." confirmLabel="Delete" onConfirm={del} onCancel={() => setDlg(null)} />}
  </>;
}
