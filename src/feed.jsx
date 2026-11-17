/**
 * Learning Feed screens (Patch 17): write a post, read the feed, like, comment and delete.
 * Rules are in feedCalc.js, storage and hooks in feedStore.js.
 */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Heart, MessageSquare, Trash2, Send } from 'lucide-react';
import { UserAvatar } from './profile.jsx';
import { Button, SectionTitle, ConfirmDialog, PageSkeleton, usePending } from './ui.jsx';
import { toast } from './materials.jsx';
import { SuggestedPeople } from './friends.jsx';
import { MAX_POST, MAX_COMMENT, MAX_TAGS, timeAgo } from './feedCalc.js';
import { useFeed, publishPost, removePost, likePost, commentOn, removeComment } from './feedStore.js';

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

function Comments({ feed, post }) {
  const [text, setText] = useState('');
  const submit = (e) => { e.preventDefault(); if (run(commentOn(feed.me, post.id, text))) setText(''); };
  return <div className="feed-comments">
    {post.comments.map((c) => { const a = feed.authorOf(c.authorId) || FORMER; const canDelete = c.authorId === feed.meId || post.authorId === feed.meId;
      return <div className="feed-comment" key={c.id}><UserAvatar size="sm" profile={a} />
        <div><p><Name person={a} /> <small>{timeAgo(c.createdAt)}</small></p><p className="feed-text">{c.text}</p></div>
        {canDelete && <button type="button" className="plain-icon" aria-label="Delete comment" title="Delete comment" onClick={() => run(removeComment(feed.me, post.id, c.id))}><Trash2 size={14} /></button>}
      </div>; })}
    <form className="feed-comment-form" onSubmit={submit}>
      <input className="field" maxLength={MAX_COMMENT} value={text} onChange={(e) => setText(e.target.value)} aria-label="Write a comment" placeholder="Write a comment…" />
      <button type="submit" className="btn outline" disabled={!text.trim()}>Reply</button>
    </form>
  </div>;
}

function PostCard({ feed, post, onDelete }) {
  const [open, setOpen] = useState(false); const a = feed.authorOf(post.authorId) || FORMER;
  const liked = post.likes.includes(feed.meId); const n = post.likes.length; const c = post.comments.length;
  return <article className="panel post-card">
    <div className="post-head"><UserAvatar profile={a} /><div><Name person={a} /><small>{timeAgo(post.createdAt)}</small></div>
      {post.authorId === feed.meId && <button type="button" className="plain-icon" aria-label="Delete post" title="Delete post" onClick={() => onDelete(post)}><Trash2 size={16} /></button>}
    </div>
    <p className="feed-text">{post.text}</p>
    {post.tags.length > 0 && <div className="post-tags">{post.tags.map((t) => <span key={t}>{t}</span>)}</div>}
    <div className="post-actions">
      <button type="button" className={liked ? 'feed-like on' : 'feed-like'} aria-pressed={liked} onClick={() => run(likePost(feed.me, post.id))}><Heart size={16} fill={liked ? 'currentColor' : 'none'} /> {n} {n === 1 ? 'Like' : 'Likes'}</button>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}><MessageSquare size={16} /> {c ? `${c} ${c === 1 ? 'Comment' : 'Comments'}` : 'Comment'}</button>
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
    {deleting && <ConfirmDialog icon={Trash2} title="Delete this post?" body="The post, its likes and its comments will be removed for everyone." confirmLabel="Delete"
      onCancel={() => setDeleting(null)} onConfirm={() => { run(removePost(feed.me, deleting.id), 'Post deleted'); setDeleting(null); }} />}
  </>;
}
