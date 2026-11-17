/**
 * Learning feed storage and hooks (Patches 17 and 18). The rules are in `src/feedCalc.js`.
 *
 * FRONTEND-ONLY DEMO: posts are saved in this browser's localStorage under one shared key, so every
 * account registered in the same browser sees the same feed (open a second tab and sign in as someone
 * else to try it). Anyone using the browser can edit it, so this is not security: a real backend must
 * check who may post, react, comment and delete.
 *
 * The first time the feed opens, it is filled with three sample posts. After that it is just your data.
 * Comments on your post, and replies to your comments, notify you (reactions do not, to avoid noise).
 * Swapping in a backend later: keep the exported function names and make them call your API.
 */
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { local } from './storage.js';
import { useProfile, ensureAccount } from './accounts.js';
import { usePeople, addNote, dropNote } from './friendsStore.js';
import { cleanPosts, sortPosts, seedPosts, createPost, deletePost, react, addComment, editComment, deleteComment } from './feedCalc.js';

export const FEED_KEY = 'knoxia-posts';
const NONE = []; // one shared empty list, so React sees an unchanged snapshot while nothing is saved
const saved = () => local.get(FEED_KEY, NONE, Array.isArray);

function useSavedPosts() {
  const subscribe = useCallback((fn) => local.subscribe(FEED_KEY, fn), []);
  return useSyncExternalStore(subscribe, saved, () => NONE);
}

/** Everything the feed screen needs: newest-first posts, who wrote them, and who is signed in. */
export function useFeed() {
  const me = useProfile(); const raw = useSavedPosts(); const people = usePeople();
  // Remove legacy sample posts once; preserve posts authored by real accounts.
  useEffect(() => {
    const current = saved();
    const real = current.filter((p) => p && typeof p.authorId === 'string' && !p.authorId.startsWith('sample:'));
    if (local.getRaw(FEED_KEY) === null || real.length !== current.length) local.set(FEED_KEY, real);
  }, []);
  // Sessions from before accounts existed have no account to post as yet: create it once.
  useEffect(() => { if (!me.id && me.email) ensureAccount(me.email); }, [me.id, me.email]);
  return useMemo(() => {
    const byId = new Map(people.map((p) => [p.id, p]));
    return { me, meId: me.id, ready: !!me.id, people, posts: sortPosts(cleanPosts(raw)), authorOf: (id) => byId.get(id) || null };
  }, [me, raw, people]);
}

/* ---------- Actions ---------- */
// Each one reads the latest saved posts, applies one rule from feedCalc.js and saves only when it worked.
function apply(fn) { const out = fn(cleanPosts(saved())); if (out.ok && !out.unchanged) local.set(FEED_KEY, out.posts); return out; }

export const publishPost = (me, text, tags) => apply((p) => createPost(p, me.id, text, tags));
export const removePost = (me, postId) => apply((p) => deletePost(p, postId, me.id));
/** Choose, change or remove your reaction. */
export const reactToPost = (me, postId, type) => apply((p) => react(p, postId, me.id, type));
/** Delete a comment (and its replies). Their notifications are removed too, so nobody is sent to something that is gone. */
export function removeComment(me, postId, commentId, people = []) {
  const post = cleanPosts(saved()).find((x) => x.id === postId);
  const out = apply((p) => deleteComment(p, postId, commentId, me.id));
  if (out.ok && post) {
    const ids = post.comments.filter((c) => c.id === commentId || c.parentId === commentId).map((c) => c.id);
    people.forEach((p) => { if (p.email) ids.forEach((id) => dropNote(p.email, `cm-${id}`)); });
  }
  return out;
}
export const changeComment = (me, postId, commentId, text) => apply((p) => editComment(p, postId, commentId, me.id, text));

/** Comment on a post, or reply to a comment (`parentId`). The post's author, or the person replied to, is notified. */
export function commentOn(me, postId, text, parentId = '', people = []) {
  const before = cleanPosts(saved()); const out = apply((p) => addComment(p, postId, me.id, text, Date.now(), parentId));
  if (!out.ok) return out;
  const post = before.find((x) => x.id === postId); const parent = parentId && post.comments.find((c) => c.id === parentId);
  const targetId = parent ? parent.authorId : post.authorId; const target = people.find((x) => x.id === targetId);
  if (target && target.email && target.id !== me.id) {
    const name = me.displayName || 'Someone';
    addNote(target.email, { id: `cm-${out.comment.id}`, t: parent ? `${name} replied to your comment` : `${name} commented on your post`, s: out.comment.text.slice(0, 80), to: '/feed' });
  }
  return out;
}
