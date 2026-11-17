/**
 * Learning feed storage and hooks (Patch 17). The rules are in `src/feedCalc.js`.
 *
 * FRONTEND-ONLY DEMO: posts are saved in this browser's localStorage under one shared key, so every
 * account registered in the same browser sees the same feed (open a second tab and sign in as someone
 * else to try it). Anyone using the browser can edit it, so this is not security: a real backend must
 * check who may post, like, comment and delete.
 *
 * The first time the feed opens, it is filled with three sample posts. After that it is just your data.
 * Swapping in a backend later: keep the exported function names and make them call your API.
 */
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { local } from './storage.js';
import { useProfile, ensureAccount } from './accounts.js';
import { usePeople } from './friendsStore.js';
import { cleanPosts, sortPosts, seedPosts, createPost, deletePost, toggleLike, addComment, deleteComment } from './feedCalc.js';

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
  // First visit: start with the sample posts. Later visits (even with an empty feed) are left alone.
  useEffect(() => { if (local.getRaw(FEED_KEY) === null) local.set(FEED_KEY, seedPosts()); }, []);
  // Sessions from before accounts existed have no account to post as yet: create it once.
  useEffect(() => { if (!me.id && me.email) ensureAccount(me.email); }, [me.id, me.email]);
  return useMemo(() => {
    const byId = new Map(people.map((p) => [p.id, p]));
    return { me, meId: me.id, ready: !!me.id, posts: sortPosts(cleanPosts(raw)), authorOf: (id) => byId.get(id) || null };
  }, [me, raw, people]);
}

/* ---------- Actions ---------- */
// Each one reads the latest saved posts, applies one rule from feedCalc.js and saves only when it worked.
function apply(fn) { const out = fn(cleanPosts(saved())); if (out.ok) local.set(FEED_KEY, out.posts); return out; }

export const publishPost = (me, text, tags) => apply((p) => createPost(p, me.id, text, tags));
export const removePost = (me, postId) => apply((p) => deletePost(p, postId, me.id));
export const likePost = (me, postId) => apply((p) => toggleLike(p, postId, me.id));
export const commentOn = (me, postId, text) => apply((p) => addComment(p, postId, me.id, text));
export const removeComment = (me, postId, commentId) => apply((p) => deleteComment(p, postId, commentId, me.id));
