/**
 * Public profile screens (Patch 19): the sections under a profile's header. Learning activity, achievements and
 * shared materials follow the person's visibility setting; their posts are public (the feed is public).
 * On your own profile you also choose who sees them and which materials to share. Rules: profileCalc.js, data: profileStore.js.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { Flame, Medal, Lock, Clock3, FileText, Share2, Zap, Target, Layers, Users, BookOpen, Trophy } from 'lucide-react';
import { toast, fmtDate } from './materials.jsx';
import { useRelation } from './friendsStore.js';
import { fmtTime } from './progressCalc.js';
import { reactionSummary, timeAgo } from './feedCalc.js';
import { VISIBILITY, MAX_SHARED, canSee, recentEvents } from './profileCalc.js';
import { usePersonActivity, useMySocial } from './profileStore.js';
import { useMaterials } from './materials.jsx';

const ICONS = { Flame, Trophy, Target, Zap, Layers, Users, BookOpen, Medal };
const KIND = { flashcards: 'Flashcards', reviewer: 'Reviewer', quiz: 'Quiz' };

const Stat = ({ label, value, note, icon: Icon, tone = 'blue' }) => <div className="stat-card"><div className={`stat-icon ${tone}`}><Icon size={18} /></div><div className="stat-copy"><span>{label}</span><strong>{value}</strong><small className="positive">{note}</small></div></div>;

function Locked({ name, visibility }) {
  return <div className="panel profile-private"><Lock size={18} aria-hidden="true" />
    <p><b>{name}’s learning activity is {visibility === 'me' ? 'private' : 'for friends only'}.</b><br />
      <span className="muted-sm">{visibility === 'me' ? 'Their streak, achievements and shared materials are hidden.' : 'Add them as a friend to see their streak, achievements and shared materials.'}</span></p></div>;
}

/** Posts a person wrote on the feed, newest first. Reaction totals and comment counts are shown, not the posts' comments. */
function RecentPosts({ posts, name, mine }) {
  const shown = posts.slice(0, 5);
  return <section className="panel"><h3>Posts</h3>
    {shown.length === 0 ? <p className="muted">{mine ? 'You have not posted yet.' : `${name} has not posted yet.`} <Link className="link-btn" to="/feed">Open the Learning Feed</Link></p>
      : <><ul className="profile-posts">{shown.map((p) => { const s = reactionSummary(p, '');
        return <li key={p.id}><p className="feed-text">{p.text}</p><small>{timeAgo(p.createdAt)} · {s.total} {s.total === 1 ? 'reaction' : 'reactions'} · {p.comments.length} {p.comments.length === 1 ? 'comment' : 'comments'}</small></li>; })}</ul>
        <Link className="link-btn" to="/feed">{posts.length > shown.length ? `See all ${posts.length} in the Learning Feed` : 'Open the Learning Feed'}</Link></>}
  </section>;
}

function Achievements({ badges, mine, name }) {
  const earned = badges.filter((b) => b[3]);
  return <section className="panel"><h3>Achievements <span className="muted-sm">{earned.length} of {badges.length}</span></h3>
    {earned.length === 0 ? <p className="muted">{mine ? 'No badges yet. Study a little each day to earn them.' : `${name} has no badges yet.`}</p>
      : <div className="profile-badges">{earned.map(([n, d, ic]) => { const I = ICONS[ic] || Medal; return <div className="profile-badge" key={n} title={d}><span className="stat-icon orange"><I size={16} /></span><b>{n}</b><small>{d}</small></div>; })}</div>}
    {mine && <p className="muted-sm" style={{ marginTop: 10 }}><Link className="link-btn" to="/achievements">See all badges</Link></p>}
  </section>;
}

function Activity({ progress, name, mine }) {
  const week = progress.week; const peak = Math.max(1, ...week.map((d) => d.count)); const recent = recentEvents(progress.events, 5);
  return <section className="panel"><h3>Learning activity</h3>
    {recent.length === 0 ? <p className="muted">{mine ? 'No study activity yet. Study a deck or take a quiz.' : `${name} has no study activity yet.`}</p>
      : <><div className="bar-chart">{week.map((d) => <div className="bar-column" key={d.key}><div className="bar-bg" title={`${d.count} ${d.count === 1 ? 'session' : 'sessions'}`}><span style={{ height: (d.count ? Math.max(8, Math.round(d.count / peak * 100)) : 0) + '%' }} /></div><small>{d.label}</small></div>)}</div>
        <p className="fr-sub">Recent</p>
        <ul className="profile-activity">{recent.map((e) => <li key={e.id}><span className="chip">{KIND[e.kind] || 'Study'}</span><div><b>{e.title}</b><small>{e.detail}</small></div><small>{timeAgo(new Date(e.date).getTime())}</small></li>)}</ul></>}
  </section>;
}

function Shared({ items, mine, name }) {
  return <section className="panel"><h3>Shared materials</h3>
    {items.length === 0 ? <p className="muted">{mine ? 'You have not shared any materials yet. Pick some below.' : `${name} has not shared any materials.`}</p>
      : <ul className="profile-materials">{items.map((m) => <li key={m.id}><span className="stat-icon"><FileText size={16} /></span><div><b>{m.name}</b><small>{[m.type, m.subject, m.uploaded ? fmtDate(m.uploaded) : ''].filter(Boolean).join(' · ')}</small>{m.desc && <small>{m.desc}</small>}</div></li>)}</ul>}
  </section>;
}

/** Your own privacy choices and the materials you share. */
function Privacy() {
  const { social, setVisibility, toggleShare } = useMySocial(); const lib = useMaterials(); const hint = VISIBILITY.find((o) => o.key === social.visibility).hint;
  return <section className="panel profile-privacy"><h3>Privacy and sharing</h3>
    <p className="field-label" id="vis-label">Who can see my learning activity, achievements and shared materials</p>
    <div className="segmented" role="radiogroup" aria-labelledby="vis-label">{VISIBILITY.map((o) => <button type="button" key={o.key} role="radio" aria-checked={social.visibility === o.key} className={social.visibility === o.key ? 'selected' : ''}
      onClick={() => { setVisibility(o.key); toast(`Visible to: ${o.label.toLowerCase()}`); }}>{o.label}</button>)}</div>
    <p className="muted-sm">{hint} Your posts on the Learning Feed are always public.</p>
    <p className="field-label" style={{ marginTop: 14 }}>Materials on my profile <span className="muted-sm">{social.shared.length} of {MAX_SHARED} shared</span></p>
    {lib.items.length === 0 ? <p className="muted">You have no materials yet.</p>
      : <ul className="profile-share-list">{lib.items.map((m) => <li key={m.id}><label><input type="checkbox" checked={social.shared.includes(m.id)} onChange={() => { const out = toggleShare(m.id); if (out.error) toast(out.error); }} /> <span>{m.name}</span></label><small>{m.type}</small></li>)}</ul>}
  </section>;
}

/**
 * `p` is the profile shown, `person` the account (or sample person) behind it, `mine` whether it is yours.
 * A made-up username has no account behind it, so there is nothing to show.
 */
export function ProfileSocial({ p, person, mine }) {
  const { rel } = useRelation(person ? person.id : ''); const data = usePersonActivity(person, mine);
  if (!person) return null;
  const name = p.displayName; const sample = !!person.sample;
  if (sample) return <div className="profile-social"><div className="notice" role="note"><span>{name} is a sample classmate for trying out the app, so there is no study activity to show.</span></div><RecentPosts posts={data.posts} name={name} /></div>;
  const allowed = canSee(data.social.visibility, mine ? 'self' : rel); const s = data.stats;
  return <div className="profile-social">
    {mine && <div className="notice" role="note"><Share2 size={16} /><span>{data.social.visibility === 'everyone' ? 'Everyone' : data.social.visibility === 'friends' ? 'Your friends' : 'Only you'} can see the sections below. Change it under Privacy and sharing.</span></div>}
    {allowed ? <>
      <div className="stats-grid compact">
        <Stat label="Study streak" value={`${s.streakCurrent} ${s.streakCurrent === 1 ? 'day' : 'days'}`} note={`Best: ${s.streakBest}`} icon={Flame} tone="green" />
        <Stat label="Achievements" value={String(data.badges.filter((b) => b[3]).length)} note="Badges earned" icon={Medal} tone="orange" />
        <Stat label="Study time" value={fmtTime(s.secs) || '0m'} note={s.quizzesTaken ? `${s.quizzesTaken} ${s.quizzesTaken === 1 ? 'quiz' : 'quizzes'} taken` : 'Flashcards and quizzes'} icon={Clock3} />
      </div>
      <div className="profile-grid"><Achievements badges={data.badges} mine={mine} name={name} /><Activity progress={data.progress} mine={mine} name={name} /></div>
      <Shared items={data.shared} mine={mine} name={name} />
    </> : <Locked name={name} visibility={data.social.visibility} />}
    <RecentPosts posts={data.posts} name={name} mine={mine} />
    {mine && <Privacy />}
  </div>;
}

