/**
 * Friends screens (Patch 16): the Friends page (friend list, requests, sent requests, find people),
 * the add / accept / remove button used on profiles, and the "People to connect with" card on the feed.
 * Rules are in friendsCalc.js, storage and hooks in friendsStore.js.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, UserPlus, UserCheck, UserX, Users, Clock3, ArrowUpRight, Check, X } from 'lucide-react';
import { UserAvatar } from './profile.jsx';
import { Button, SectionTitle, ConfirmDialog, PageSkeleton } from './ui.jsx';
import { toast, fmtDate } from './materials.jsx';
import { MIN_QUERY, normalizeQuery, searchPeople, suggestPeople } from './friendsCalc.js';
import {
  useFriends, useRelation, sendFriendRequest, acceptFriendRequest, declineFriendRequest, cancelFriendRequest, removeFriendship,
} from './friendsStore.js';

const SAMPLE_HINT = 'Sample account. It accepts requests right away so you can try the Friends screens on your own.';
const SampleTag = () => <span className="fr-tag" title={SAMPLE_HINT}>Sample</span>;
const run = async (pending, okMsg) => { try { const out = await pending; if (out.error) toast(out.error); else if (okMsg) toast(okMsg); return !out.error; } catch (e) { toast(e.message || 'Something went wrong.'); return false; } };

/**
 * The right button for how you stand with `person`: Add friend, Request sent (cancel), Accept / Decline, or Friends (remove).
 * `compact` is the small version used in lists.
 */
export function FriendAction({ person, compact = false }) {
  const { me, rel, record } = useRelation(person.id); const [confirm, setConfirm] = useState(false);
  if (rel === 'self') return null;
  const name = person.displayName;
  const add = () => run(sendFriendRequest(me, person), `Friend request sent to ${name}`);
  const accept = () => record && run(acceptFriendRequest(me, person, record.id), `You and ${name} are now friends`);
  const decline = () => record && run(declineFriendRequest(me, record.id), 'Request declined');
  const cancel = () => record && run(cancelFriendRequest(me, person, record.id), 'Request cancelled');
  const remove = () => { setConfirm(false); run(removeFriendship(me, person), `${name} was removed from your friends`); };

  if (rel === 'none') return compact
    ? <button type="button" className="small-outline" onClick={add} aria-label={`Add ${name} as a friend`}>Add</button>
    : <button type="button" className="btn primary" onClick={add}><UserPlus size={16} /><span>Add friend</span></button>;
  if (rel === 'received') return <div className="fr-actions">
    <button type="button" className={compact ? 'small-outline' : 'btn primary'} onClick={accept} aria-label={`Accept ${name}'s friend request`}>{!compact && <Check size={16} />}<span>Accept</span></button>
    {!compact && <button type="button" className="btn outline" onClick={decline}><X size={16} /><span>Decline</span></button>}
  </div>;
  if (rel === 'sent') return <div className="fr-actions">
    <span className="fr-state"><Clock3 size={14} />{compact ? 'Requested' : 'Request sent'}</span>
    {!compact && <button type="button" className="link-btn" onClick={cancel}>Cancel request</button>}
  </div>;
  return <div className="fr-actions"> {/* friends */}
    <span className="fr-state ok"><UserCheck size={14} />Friends</span>
    {!compact && <button type="button" className="link-btn" onClick={() => setConfirm(true)}>Remove</button>}
    {confirm && <RemoveDialog name={name} onConfirm={remove} onCancel={() => setConfirm(false)} />}
  </div>;
}

const RemoveDialog = ({ name, onConfirm, onCancel }) => <ConfirmDialog icon={UserX} title={`Remove ${name} from your friends?`}
  body="You will no longer appear in each other's friend lists. Either of you can send a new request later." confirmLabel="Remove" onConfirm={onConfirm} onCancel={onCancel} />;

/** One person on a line: picture, name (links to their profile), @username and academic details, then actions. */
function PersonRow({ person, note, children }) {
  return <li className="fr-row">
    <UserAvatar profile={person} />
    <div className="fr-main">
      <span><Link to={`/profile/${person.username}`}>{person.displayName}</Link>{person.sample && <SampleTag />}</span>
      <small>@{person.username}{person.academic ? ` · ${person.academic}` : ''}</small>
      {note && <small>{note}</small>}
    </div>
    {children}
  </li>;
}

const TABS = [['friends', 'All friends'], ['requests', 'Requests'], ['sent', 'Sent'], ['find', 'Find people']];

export function Friends() {
  const f = useFriends(); const [params, setParams] = useSearchParams();
  const tab = TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') : 'friends';
  const setTab = (t) => setParams(t === 'friends' ? {} : { tab: t }, { replace: true });
  const [mine, setMine] = useState(''); const [query, setQuery] = useState(''); const [removing, setRemoving] = useState(null);
  const finder = useRef(null);
  useEffect(() => { if (tab === 'find' && finder.current) finder.current.focus(); }, [tab]);

  const shownFriends = useMemo(() => {
    const q = normalizeQuery(mine);
    return f.friends.filter((x) => !q || `${x.person.displayName} ${x.person.username}`.toLowerCase().includes(q)).sort((a, b) => a.person.displayName.localeCompare(b.person.displayName));
  }, [f.friends, mine]);
  const results = useMemo(() => searchPeople(f.people, query, f.meId), [f.people, query, f.meId]);
  const suggestions = useMemo(() => suggestPeople(f.people, f.records, f.meId, 6), [f.people, f.records, f.meId]);
  if (!f.ready) return <PageSkeleton />;
  if (f.error) return <div className="empty-state" role="alert"><b>Could not load friends</b><p>{f.error}</p></div>;

  const counts = { friends: f.friends.length, requests: f.incoming.length, sent: f.outgoing.length };
  const typed = normalizeQuery(query);

  return <>
    <SectionTitle title="Friends" subtitle="Build your learning circle and grow together." action={<Button icon={UserPlus} onClick={() => setTab('find')}>Find friends</Button>} />
    <div className="tabs fr-tabs">{TABS.map(([k, label]) => <button type="button" key={k} className={tab === k ? 'active' : ''} aria-pressed={tab === k} onClick={() => setTab(k)}>
      {label}{k !== 'find' && counts[k] > 0 && <span className={`fr-count${k === 'requests' ? ' alert' : ''}`}>{counts[k]}</span>}
    </button>)}</div>

    {tab === 'friends' && (f.friends.length === 0
      ? <div className="empty-state"><Users size={32} /><b>No friends yet</b><p>Find classmates to study with. Friends show up here once they accept your request.</p><Button icon={UserPlus} onClick={() => setTab('find')}>Find people</Button></div>
      : <>
        <div className="toolbar"><div className="search-field"><Search size={16} /><input aria-label="Search your friends" placeholder="Search your friends" value={mine} onChange={(e) => setMine(e.target.value)} /></div></div>
        {shownFriends.length === 0 ? <p className="muted" role="status">No friends match “{mine.trim()}”.</p>
          : <div className="friend-grid">{shownFriends.map(({ person, since, id }) => <div className="panel friend-card" key={id}>
            <UserAvatar profile={person} size="lg" />
            <h3>{person.displayName}{person.sample && <SampleTag />}</h3><p>@{person.username}</p>
            {person.academic && <span className="fr-meta">{person.academic}</span>}
            <span className="fr-since">Friends since {fmtDate(since)}</span>
            <div className="friend-buttons"><Link className="btn soft" to={`/profile/${person.username}`}>View profile</Link><Button variant="outline" icon={UserX} onClick={() => setRemoving(person)}>Remove</Button></div>
          </div>)}</div>}
      </>)}

    {tab === 'requests' && <div className="panel fr-panel">
      <h3>Friend requests</h3>
      {f.incoming.length === 0 ? <p className="muted" role="status">No requests waiting. When someone adds you, it shows up here.</p>
        : <ul className="fr-list">{f.incoming.map(({ person, id, since }) => <PersonRow key={id} person={person} note={`Sent you a request on ${fmtDate(since)}`}><FriendAction person={person} /></PersonRow>)}</ul>}
    </div>}

    {tab === 'sent' && <div className="panel fr-panel">
      <h3>Requests you sent</h3>
      {f.outgoing.length === 0 ? <p className="muted" role="status">You have no pending requests. <button type="button" className="link-btn" onClick={() => setTab('find')}>Find people</button></p>
        : <ul className="fr-list">{f.outgoing.map(({ person, id, since }) => <PersonRow key={id} person={person} note={`Sent on ${fmtDate(since)}. Waiting for a reply.`}><FriendAction person={person} /></PersonRow>)}</ul>}
    </div>}

    {tab === 'find' && <div className="panel fr-panel">
      <h3>Find people</h3>
      <div className="toolbar"><div className="search-field"><Search size={16} /><input ref={finder} type="search" aria-label="Search for people" placeholder="Search by name or username" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" /></div></div>
      {typed.length === 0 && <>
        <p className="fr-sub">Suggested for you</p>
        {suggestions.length === 0 ? <p className="muted" role="status">There is no one new to add right now. Ask a classmate to create a KNOXIA account, or sign in as another account in a second tab to try requests between two people.</p>
          : <ul className="fr-list">{suggestions.map((p) => <PersonRow key={p.id} person={p}><FriendAction person={p} /></PersonRow>)}</ul>}
      </>}
      {typed.length > 0 && typed.length < MIN_QUERY && <p className="muted" role="status">Type at least {MIN_QUERY} characters.</p>}
      {typed.length >= MIN_QUERY && (results.length === 0
        ? <p className="muted" role="status">No one found for “{query.trim()}”. Check the spelling, or search by username.</p>
        : <><p className="fr-sub" role="status">{results.length} {results.length === 1 ? 'person' : 'people'} found</p><ul className="fr-list">{results.map((p) => <PersonRow key={p.id} person={p}><FriendAction person={p} /></PersonRow>)}</ul></>)}
    </div>}

    {removing && <RemoveDialog name={removing.displayName} onCancel={() => setRemoving(null)}
      onConfirm={() => { run(removeFriendship(f.me, removing), `${removing.displayName} was removed from your friends`); setRemoving(null); }} />}
  </>;
}

/** "People to connect with" card on the Learning Feed. The list is picked once, so a row stays put after you press Add. */
export function SuggestedPeople({ limit = 3 }) {
  const f = useFriends(); const ids = useRef(null);
  if (ids.current === null && f.ready) ids.current = suggestPeople(f.people, f.records, f.meId, limit).map((p) => p.id);
  const list = (ids.current || []).map((id) => f.people.find((p) => p.id === id)).filter(Boolean);
  return <div className="panel community-card"><h3>People to connect with</h3>
    {list.length === 0 && <p className="muted-sm">No suggestions right now.</p>}
    {list.map((p) => <div className="friend-row" key={p.id}><UserAvatar profile={p} /><div><b>{p.displayName}</b><small>@{p.username}</small></div><FriendAction person={p} compact /></div>)}
    <Link to="/friends?tab=find">Find more friends <ArrowUpRight size={16} /></Link>
  </div>;
}
