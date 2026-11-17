/**
 * Learning Feed screens (Patches 17 and 18): write a post, read the feed, react, comment, reply, edit and delete.
 * Rules are in feedCalc.js, storage and hooks in feedStore.js.
 */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, MessageSquare, Trash2, Send, Pencil, Reply } from 'lucide-react';
import { UserAvatar } from './profile.jsx';
import { Button, SectionTitle, ConfirmDialog, PageSkeleton, usePending } from './ui.jsx';
import { toast } from './materials.jsx';
import { SuggestedPeople } from './friends.jsx';
import { MAX_POST, MAX_COMMENT, MAX_TAGS, REACTIONS, reactionOf, reactionSummary, reactors, commentThreads, timeAgo } from './feedCalc.js';
import { useFeed, publishPost, removePost, reactToPost, commentOn, changeComment, removeComment } from './feedStore.js';

const PAGE = 10;
const run = (out, okMsg) => { if (out.error) toast(out.error); else if (okMsg) toast(okMsg); return !out.error; };
const FORMER = { displayName: 'Former member', initials: '?', avatar: '', username: '' };

/** Name that links to the person's profile when they have one. */
const Name = ({ person }) => (person.username ? <Link to={`/profile/${person.username}`} className="feed-name">{person.displayName}</Link> : <b>{person.displayName}</b>);

function Composer({ feed }) {
  const [text, setText] = useState(''); const [tags, setTags] = useState(''); const left = MAX_POST - text.length;
  const submit = (e) => {
    e.preventDefault();
    if (run(publishPost(feed.me, text, tags), 'Posted to the feed')) { setText(''); setTags(''); }
  };
  return <form className="panel feed-composer" onSubmit={submit}>
    <div className="feed-compose-row"><UserAvatar />
      <textarea className="field" rows={3} maxLength={MAX_POST} value={text} onChange={(e) => setText(e.target.value)} aria-label="Share a learning update" placeholder={`What are you learning, ${feed.me.firstName}?`} />
    </div>
    <div className="feed-compose-foot">
      <input className="field" value={tags} onChange={(e) => setTags(e.target.value)} aria-label="Tags" placeholder={`Tags, separated by commas (up to ${MAX_TAGS})`} />
      <small className={left < 50 ? 'feed-count warn' : 'feed-count'}>{left}</small>
      <Button type="submit" icon={Send}>Post</Button>
    </div>
  </form>;
}

/** One line of text with a Save/Cancel pair. Used to write a comment, write a reply and edit a comment. */
function TextForm({ initial = '', placeholder, label, submitLabel, onSubmit, onCancel, autoFocus = false }) {
  const [text, setText] = useState(initial);
  const submit = (e) => { e.preventDefault(); if (onSubmit(text)) { if (!onCancel) setText(''); } };
  return <form className="feed-comment-form" onSubmit={submit}>
    <input className="field" autoFocus={autoFocus} maxLength={MAX_COMMENT} value={text} onChange={(e) => setText(e.target.value)} aria-label={label} placeholder={placeholder}
      onKeyDown={(e) => { if (e.key === 'Escape' && onCancel) onCancel(); }} />
    <button type="submit" className="btn outline" disabled={!text.trim()}>{submitLabel}</button>
    {onCancel && <button type="button" className="btn outline" onClick={onCancel}>Cancel</button>}
  </form>;
}

function Comment({ feed, post, c, isReply, onAskDelete }) {
  const [mode, setMode] = useState(''); // '' | 'edit' | 'reply'
  const a = feed.authorOf(c.authorId) || FORMER; const mine = c.authorId === feed.meId; const canDelete = mine || post.authorId === feed.meId;
  const save = (text) => { const ok = run(changeComment(feed.me, post.id, c.id, text), 'Comment updated'); if (ok) setMode(''); return ok; };
  const send = (text) => { const ok = run(commentOn(feed.me, post.id, text, c.id, feed.people)); if (ok) setMode(''); return ok; };
  return <div className={isReply ? 'feed-comment reply' : 'feed-comment'}><UserAvatar size="sm" profile={a} />
    <div>
      <p><Name person={a} /> <small>{timeAgo(c.createdAt)}{c.editedAt ? ' · edited' : ''}</small></p>
      {mode === 'edit'
        ? <TextForm autoFocus initial={c.text} label="Edit comment" submitLabel="Save" onSubmit={save} onCancel={() => setMode('')} />
        : <p className="feed-text">{c.text}</p>}
      {mode !== 'edit' && <div className="feed-comment-actions">
        {!isReply && <button type="button" onClick={() => setMode(mode === 'reply' ? '' : 'reply')} aria-expanded={mode === 'reply'}><Reply size={13} /> Reply</button>}
        {mine && <button type="button" onClick={() => setMode('edit')}><Pencil size={13} /> Edit</button>}
        {canDelete && <button type="button" onClick={() => onAskDelete(c)}><Trash2 size={13} /> Delete</button>}
      </div>}
      {mode === 'reply' && <TextForm autoFocus label={`Reply to ${a.displayName}`} placeholder={`Reply to ${a.displayName}…`} submitLabel="Reply" onSubmit={send} onCancel={() => setMode('')} />}
    </div>
  </div>;
}

function Comments({ feed, post }) {
  const [asking, setAsking] = useState(null); const threads = commentThreads(post);
  const send = (text) => run(commentOn(feed.me, post.id, text, '', feed.people));
  const replies = asking ? post.comments.filter((r) => r.parentId === asking.id).length : 0;
  return <div className="feed-comments">
    {threads.map((t) => <div className="feed-thread" key={t.id}>
      <Comment feed={feed} post={post} c={t} onAskDelete={setAsking} />
      {t.replies.map((r) => <Comment key={r.id} feed={feed} post={post} c={r} isReply onAskDelete={setAsking} />)}
    </div>)}
    <TextForm label="Write a comment" placeholder="Write a comment…" submitLabel="Comment" onSubmit={send} />
    {asking && <ConfirmDialog icon={Trash2} title={asking.parentId ? 'Delete this reply?' : 'Delete this comment?'}
      body={replies ? `This comment and its ${replies} ${replies === 1 ? 'reply' : 'replies'} will be removed for everyone.` : 'It will be removed for everyone.'} confirmLabel="Delete"
      onCancel={() => setAsking(null)} onConfirm={() => { run(removeComment(feed.me, post.id, asking.id, feed.people), asking.parentId ? 'Reply deleted' : 'Comment deleted'); setAsking(null); }} />}
  </div>;
}

/** The reaction buttons of a post. Press one to react, press it again to take it back, press another to change. */
function Reactions({ feed, post }) {
  const [who, setWho] = useState(false); const s = reactionSummary(post, feed.meId); const list = who ? reactors(post) : [];
  return <div className="feed-reactions">
    <div className="feed-react-row" role="group" aria-label="Reactions">
      {REACTIONS.map((r) => { const n = s.counts[r.key] || 0; const on = s.mine === r.key;
        return <button type="button" key={r.key} className={on ? 'feed-react on' : 'feed-react'} aria-pressed={on} title={on ? `Remove your ${r.label.toLowerCase()}` : r.label} aria-label={`${r.label}${n ? `, ${n}` : ''}`}
          onClick={() => run(reactToPost(feed.me, post.id, r.key))}><span aria-hidden="true">{r.emoji}</span>{n > 0 && <b>{n}</b>}</button>; })}
      {s.total > 0 && <button type="button" className="feed-who-btn" aria-expanded={who} onClick={() => setWho(!who)}>{s.total} {s.total === 1 ? 'reaction' : 'reactions'}</button>}
    </div>
    {who && <ul className="feed-who">{list.map((x) => { const a = feed.authorOf(x.userId); const r = reactionOf(x.type);
      return <li key={x.userId}><span aria-hidden="true">{r.emoji}</span> {x.userId === feed.meId ? 'You' : a ? a.displayName : x.userId.startsWith('sample:fan') ? 'A classmate' : 'Former member'} <small>{r.label}</small></li>; })}</ul>}
  </div>;
}

function PostCard({ feed, post, onDelete }) {
  const [open, setOpen] = useState(false); const a = feed.authorOf(post.authorId) || FORMER; const c = post.comments.length;
  return <article className="panel post-card">
    <div className="post-head"><UserAvatar profile={a} /><div><Name person={a} /><small>{timeAgo(post.createdAt)}</small></div>
      {post.authorId === feed.meId && <button type="button" className="plain-icon" aria-label="Delete post" title="Delete post" onClick={() => onDelete(post)}><Trash2 size={16} /></button>}
    </div>
    <p className="feed-text">{post.text}</p>
    {post.tags.length > 0 && <div className="post-tags">{post.tags.map((t) => <span key={t}>{t}</span>)}</div>}
    <div className="post-actions">
      <Reactions feed={feed} post={post} />
      <button type="button" className="feed-comment-btn" aria-expanded={open} onClick={() => setOpen(!open)}><MessageSquare size={16} /> {c ? `${c} ${c === 1 ? 'Comment' : 'Comments'}` : 'Comment'}</button>
    </div>
    {open && <Comments feed={feed} post={post} />}
  </article>;
}

export default function Feed() {
  const pending = usePending(); const feed = useFeed(); const [shown, setShown] = useState(PAGE); const [deleting, setDeleting] = useState(null);
  if (pending || !feed.ready) return <PageSkeleton cards />;
  const visible = feed.posts.slice(0, shown);
  return <>
    <SectionTitle title="Learning Feed" subtitle="See what your learning community is up to." />
    <div className="social-layout"><div className="feed-column">
      <Composer feed={feed} />
      {feed.posts.length === 0 && <div className="panel"><p className="muted">No posts yet. Share what you are learning to start the feed.</p></div>}
      {visible.map((p) => <PostCard key={p.id} feed={feed} post={p} onDelete={setDeleting} />)}
      {feed.posts.length > shown && <Button variant="outline" icon={Plus} onClick={() => setShown(shown + PAGE)}>Show more posts</Button>}
    </div><SuggestedPeople /></div>
    {deleting && <ConfirmDialog icon={Trash2} title="Delete this post?" body="The post, its reactions and its comments will be removed for everyone." confirmLabel="Delete"
      onCancel={() => setDeleting(null)} onConfirm={() => { run(removePost(feed.me, deleting.id), 'Post deleted'); setDeleting(null); }} />}
  </>;
}
