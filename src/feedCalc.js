/**
 * Social learning feed rules (Patch 17).
 *
 * Pure functions only: no storage, no React (so `npm test` can cover them). Storage and hooks live in
 * `src/feedStore.js`, the screens in `src/feed.jsx`.
 *
 * A post is { id, authorId, text, tags, createdAt, likes: [accountId], comments: [comment] }
 * A comment is { id, authorId, text, createdAt }
 * People are identified by account id (`src/accounts.js`). Every action takes the current posts and
 * returns { posts, ok } or { posts, error }. When `error` is set, nothing should be saved.
 */

export const MAX_POST = 500;
export const MAX_COMMENT = 300;
export const MAX_TAGS = 3;
export const MAX_TAG_LEN = 20;

/** Trim and collapse spaces on each line, keep line breaks (at most one blank line in a row). */
export const cleanText = (s) => String(s ?? '').replace(/\r/g, '').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();

/** "ml, #study tips" -> ['ml', 'study tips']: at most MAX_TAGS, no duplicates, each cut to MAX_TAG_LEN. */
export function parseTags(input) {
  const out = []; const seen = new Set();
  for (const raw of String(input ?? '').split(/[,\n]/)) {
    const t = raw.replace(/#/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_TAG_LEN).trim();
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase()); out.push(t);
    if (out.length === MAX_TAGS) break;
  }
  return out;
}

export const isComment = (c) => !!c && typeof c === 'object' && typeof c.id === 'string' && typeof c.authorId === 'string' && typeof c.text === 'string' && Number.isFinite(c.createdAt);
export const isPost = (p) => !!p && typeof p === 'object' && typeof p.id === 'string' && typeof p.authorId === 'string' && typeof p.text === 'string' && Number.isFinite(p.createdAt);

/** Saved data can be missing, corrupt or edited by hand: keep only well-formed posts, fix the rest of their fields. */
export function cleanPosts(posts) {
  if (!Array.isArray(posts)) return [];
  const seen = new Set(); const out = [];
  for (const p of posts) {
    if (!isPost(p) || seen.has(p.id)) continue; seen.add(p.id);
    out.push({
      ...p,
      tags: Array.isArray(p.tags) ? p.tags.filter((t) => typeof t === 'string') : [],
      likes: Array.isArray(p.likes) ? [...new Set(p.likes.filter((x) => typeof x === 'string'))] : [],
      comments: Array.isArray(p.comments) ? p.comments.filter(isComment) : [],
    });
  }
  return out;
}

/** Newest first. */
export const sortPosts = (posts) => [...posts].sort((a, b) => b.createdAt - a.createdAt);

/** Posts by `authorId`, e.g. for a profile page. */
export const postsBy = (posts, authorId) => posts.filter((p) => p.authorId === authorId);

const fail = (posts, error) => ({ posts, error });
const mapPost = (posts, id, fn) => posts.map((p) => (p.id === id ? fn(p) : p));
const has = (posts, id) => posts.some((p) => p.id === id);
const makeId = (prefix, now, n) => `${prefix}-${now.toString(36)}-${n.toString(36)}`;

export function createPost(posts, authorId, text, tags, now = Date.now()) {
  if (!authorId) return fail(posts, 'Sign in to post.');
  const t = cleanText(text);
  if (!t) return fail(posts, 'Write something to share first.');
  if (t.length > MAX_POST) return fail(posts, `Posts can be up to ${MAX_POST} characters.`);
  const post = { id: makeId('p', now, posts.length), authorId, text: t, tags: Array.isArray(tags) ? tags : parseTags(tags), createdAt: now, likes: [], comments: [] };
  return { posts: [post, ...posts], ok: true, post };
}

/** Only the author can delete a post. */
export function deletePost(posts, postId, userId) {
  const p = posts.find((x) => x.id === postId);
  if (!p) return fail(posts, 'That post no longer exists.');
  if (p.authorId !== userId) return fail(posts, 'You can only delete your own posts.');
  return { posts: posts.filter((x) => x.id !== postId), ok: true };
}

/** Like if you have not, unlike if you have. `liked` says where you ended up. */
export function toggleLike(posts, postId, userId) {
  if (!userId) return fail(posts, 'Sign in to like posts.');
  const p = posts.find((x) => x.id === postId);
  if (!p) return fail(posts, 'That post no longer exists.');
  const liked = !p.likes.includes(userId);
  return { posts: mapPost(posts, postId, (x) => ({ ...x, likes: liked ? [...x.likes, userId] : x.likes.filter((u) => u !== userId) })), ok: true, liked };
}

export function addComment(posts, postId, userId, text, now = Date.now()) {
  if (!userId) return fail(posts, 'Sign in to comment.');
  if (!has(posts, postId)) return fail(posts, 'That post no longer exists.');
  const t = cleanText(text);
  if (!t) return fail(posts, 'Write a comment first.');
  if (t.length > MAX_COMMENT) return fail(posts, `Comments can be up to ${MAX_COMMENT} characters.`);
  const n = posts.find((x) => x.id === postId).comments.length;
  const comment = { id: makeId('c', now, n), authorId: userId, text: t, createdAt: now };
  return { posts: mapPost(posts, postId, (x) => ({ ...x, comments: [...x.comments, comment] })), ok: true, comment };
}

/** The comment's author, or the post's author, can remove a comment. */
export function deleteComment(posts, postId, commentId, userId) {
  const p = posts.find((x) => x.id === postId); const c = p && p.comments.find((x) => x.id === commentId);
  if (!c) return fail(posts, 'That comment no longer exists.');
  if (c.authorId !== userId && p.authorId !== userId) return fail(posts, 'You can only delete your own comments.');
  return { posts: mapPost(posts, postId, (x) => ({ ...x, comments: x.comments.filter((y) => y.id !== commentId) })), ok: true };
}

/** "just now", "5 minutes ago", "2 hours ago", "Yesterday", "3 days ago", then a date. */
export function timeAgo(ts, now = Date.now()) {
  const s = Math.max(0, Math.floor((now - ts) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.floor(h / 24); if (d === 1) return 'Yesterday'; if (d < 7) return `${d} days ago`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** The three starter posts the feed begins with, written by the sample classmates (see friendsCalc.js). */
export function seedPosts(now = Date.now()) {
  const H = 3600e3;
  const mk = (id, username, text, tags, ago, likes) => ({ id, authorId: `sample:${username}`, text, tags, createdAt: now - ago, likes: Array.from({ length: likes }, (_, i) => `sample:fan${i}`), comments: [] });
  return [
    mk('seed-1', 'mikas', 'Finally understood the difference between DFA and NFA after making my own visual notes. Sharing this in case anyone needs it!', ['Automata Theory', 'Study tips'], 2 * H, 18),
    mk('seed-2', 'alexrivera', 'Small progress today: finished my Machine Learning reviewer and scored 9/10 on my practice quiz. Keep going, everyone!', ['Machine Learning', 'Progress'], 26 * H, 24),
    mk('seed-3', 'jordanlee', 'Looking for study buddies for our Computer Architecture exam next week. Anyone interested?', ['Study group'], 50 * H, 12),
  ];
}
