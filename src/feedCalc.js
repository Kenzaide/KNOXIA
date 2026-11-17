/**
 * Social learning feed rules (Patches 17 and 18).
 *
 * Pure functions only: no storage, no React (so `npm test` can cover them). Storage and hooks live in
 * `src/feedStore.js`, the screens in `src/feed.jsx`.
 *
 * A post is { id, authorId, text, tags, createdAt, reactions: { [accountId]: reactionKey }, comments: [comment] }
 * A comment is { id, authorId, text, createdAt, parentId, editedAt? }
 *   `parentId` is '' for a comment on the post, or the id of the comment it replies to. Replies go one level deep:
 *   a reply cannot be replied to, so conversations stay easy to read.
 * Each person has at most one reaction per post. Posts saved by Patch 17 had `likes: [accountId]`: they are read as 'like' reactions.
 * People are identified by account id (`src/accounts.js`). Every action takes the current posts and
 * returns { posts, ok } or { posts, error }. When `error` is set, nothing should be saved.
 */

export const MAX_POST = 500;
export const MAX_COMMENT = 300;
export const MAX_TAGS = 3;
export const MAX_TAG_LEN = 20;

/** The reactions people can choose from. The first one is the plain "Like". */
export const REACTIONS = [
  { key: 'like', emoji: '👍', label: 'Like' },
  { key: 'insightful', emoji: '💡', label: 'Insightful' },
  { key: 'celebrate', emoji: '🎉', label: 'Celebrate' },
  { key: 'motivated', emoji: '🔥', label: 'Motivated' },
];
export const isReaction = (k) => REACTIONS.some((r) => r.key === k);
export const reactionOf = (k) => REACTIONS.find((r) => r.key === k) || REACTIONS[0];

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

/** Reactions as a clean { accountId: key } map. Old `likes` lists become 'like' reactions. */
function cleanReactions(p) {
  const out = {};
  if (Array.isArray(p.likes)) p.likes.forEach((id) => { if (typeof id === 'string' && id) out[id] = 'like'; });
  if (p.reactions && typeof p.reactions === 'object' && !Array.isArray(p.reactions)) {
    Object.entries(p.reactions).forEach(([id, k]) => { if (id && isReaction(k)) out[id] = k; });
  }
  return out;
}

/** Comments with a usable shape, unique ids, and replies only under an existing top-level comment. */
function cleanComments(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set(); const ok = [];
  for (const c of list) { if (!isComment(c) || seen.has(c.id)) continue; seen.add(c.id); ok.push({ ...c, parentId: typeof c.parentId === 'string' ? c.parentId : '' }); }
  const top = new Set(ok.filter((c) => !c.parentId).map((c) => c.id));
  return ok.filter((c) => !c.parentId || top.has(c.parentId));
}

/** Saved data can be missing, corrupt or edited by hand: keep only well-formed posts, fix the rest of their fields. */
export function cleanPosts(posts) {
  if (!Array.isArray(posts)) return [];
  const seen = new Set(); const out = [];
  for (const p of posts) {
    if (!isPost(p) || seen.has(p.id)) continue; seen.add(p.id);
    const { likes, ...rest } = p; // eslint-disable-line no-unused-vars
    out.push({ ...rest, tags: Array.isArray(p.tags) ? p.tags.filter((t) => typeof t === 'string') : [], reactions: cleanReactions(p), comments: cleanComments(p.comments) });
  }
  return out;
}

/** Newest first. */
export const sortPosts = (posts) => [...posts].sort((a, b) => b.createdAt - a.createdAt);

/** Posts by `authorId`, e.g. for a profile page. */
export const postsBy = (posts, authorId) => posts.filter((p) => p.authorId === authorId);

const fail = (posts, error) => ({ posts, error });
const mapPost = (posts, id, fn) => posts.map((p) => (p.id === id ? fn(p) : p));
function uniqueId(prefix, now, taken) {
  let n = taken.size; let id = `${prefix}-${now.toString(36)}-${n.toString(36)}`;
  while (taken.has(id)) id = `${prefix}-${now.toString(36)}-${(++n).toString(36)}`;
  return id;
}

/* ---------- Posts ---------- */
export function createPost(posts, authorId, text, tags, now = Date.now()) {
  if (!authorId) return fail(posts, 'Sign in to post.');
  const t = cleanText(text);
  if (!t) return fail(posts, 'Write something to share first.');
  if (t.length > MAX_POST) return fail(posts, `Posts can be up to ${MAX_POST} characters.`);
  const post = { id: uniqueId('p', now, new Set(posts.map((p) => p.id))), authorId, text: t, tags: Array.isArray(tags) ? tags : parseTags(tags), createdAt: now, reactions: {}, comments: [] };
  return { posts: [post, ...posts], ok: true, post };
}

/** Only the author can delete a post. */
export function deletePost(posts, postId, userId) {
  const p = posts.find((x) => x.id === postId);
  if (!p) return fail(posts, 'That post no longer exists.');
  if (p.authorId !== userId) return fail(posts, 'You can only delete your own posts.');
  return { posts: posts.filter((x) => x.id !== postId), ok: true };
}

/* ---------- Reactions ---------- */
/**
 * Set your reaction to `type`. Choosing the one you already have removes it; choosing another one changes it.
 * `mine` says what you have afterwards ('' when removed).
 */
export function react(posts, postId, userId, type = 'like') {
  if (!userId) return fail(posts, 'Sign in to react to posts.');
  if (!isReaction(type)) return fail(posts, 'That reaction is not available.');
  const p = posts.find((x) => x.id === postId);
  if (!p) return fail(posts, 'That post no longer exists.');
  const mine = p.reactions[userId] === type ? '' : type;
  return { posts: mapPost(posts, postId, (x) => { const r = { ...x.reactions }; if (mine) r[userId] = mine; else delete r[userId]; return { ...x, reactions: r }; }), ok: true, mine };
}

/** { total, counts: { key: n }, top: [keys, most used first], mine } for one post. */
export function reactionSummary(post, userId) {
  const counts = {}; Object.values(post.reactions || {}).forEach((k) => { counts[k] = (counts[k] || 0) + 1; });
  const order = REACTIONS.map((r) => r.key);
  const top = Object.keys(counts).sort((a, b) => (counts[b] - counts[a]) || (order.indexOf(a) - order.indexOf(b)));
  return { total: Object.keys(post.reactions || {}).length, counts, top, mine: (post.reactions || {})[userId] || '' };
}

/** Who reacted and how: [{ userId, type }], in reaction order, so a list of names reads the same each time. */
export function reactors(post) {
  const order = REACTIONS.map((r) => r.key);
  return Object.entries(post.reactions || {}).map(([userId, type]) => ({ userId, type })).sort((a, b) => (order.indexOf(a.type) - order.indexOf(b.type)) || a.userId.localeCompare(b.userId));
}

/* ---------- Comments and replies ---------- */
/** Comment on a post, or reply to one of its comments when `parentId` is given. Oldest first. */
export function addComment(posts, postId, userId, text, now = Date.now(), parentId = '') {
  if (!userId) return fail(posts, 'Sign in to comment.');
  const post = posts.find((x) => x.id === postId);
  if (!post) return fail(posts, 'That post no longer exists.');
  if (parentId) {
    const parent = post.comments.find((c) => c.id === parentId);
    if (!parent) return fail(posts, 'The comment you are replying to no longer exists.');
    if (parent.parentId) return fail(posts, 'Reply to the original comment instead.');
  }
  const t = cleanText(text);
  if (!t) return fail(posts, parentId ? 'Write a reply first.' : 'Write a comment first.');
  if (t.length > MAX_COMMENT) return fail(posts, `Comments can be up to ${MAX_COMMENT} characters.`);
  const comment = { id: uniqueId('c', now, new Set(post.comments.map((c) => c.id))), authorId: userId, text: t, createdAt: now, parentId: parentId || '' };
  return { posts: mapPost(posts, postId, (x) => ({ ...x, comments: [...x.comments, comment] })), ok: true, comment };
}

/** Only the author of a comment can edit it. Saving the same text changes nothing. */
export function editComment(posts, postId, commentId, userId, text, now = Date.now()) {
  const post = posts.find((x) => x.id === postId); const c = post && post.comments.find((x) => x.id === commentId);
  if (!c) return fail(posts, 'That comment no longer exists.');
  if (c.authorId !== userId) return fail(posts, 'You can only edit your own comments.');
  const t = cleanText(text);
  if (!t) return fail(posts, 'A comment cannot be empty. Delete it instead.');
  if (t.length > MAX_COMMENT) return fail(posts, `Comments can be up to ${MAX_COMMENT} characters.`);
  if (t === c.text) return { posts, ok: true, unchanged: true };
  return { posts: mapPost(posts, postId, (x) => ({ ...x, comments: x.comments.map((y) => (y.id === commentId ? { ...y, text: t, editedAt: now } : y)) })), ok: true };
}

/** The comment's author, or the post's author, can remove a comment. Removing a comment also removes its replies. */
export function deleteComment(posts, postId, commentId, userId) {
  const p = posts.find((x) => x.id === postId); const c = p && p.comments.find((x) => x.id === commentId);
  if (!c) return fail(posts, 'That comment no longer exists.');
  if (c.authorId !== userId && p.authorId !== userId) return fail(posts, 'You can only delete your own comments.');
  return { posts: mapPost(posts, postId, (x) => ({ ...x, comments: x.comments.filter((y) => y.id !== commentId && y.parentId !== commentId) })), ok: true };
}

/** Comments in conversation order: [{ ...comment, replies: [comment] }], oldest first at both levels. */
export function commentThreads(post) {
  const byOld = (a, b) => a.createdAt - b.createdAt;
  const top = post.comments.filter((c) => !c.parentId).sort(byOld);
  return top.map((c) => ({ ...c, replies: post.comments.filter((r) => r.parentId === c.id).sort(byOld) }));
}

/* ---------- Time and starter content ---------- */
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
  const mk = (id, username, text, tags, ago, likes) => ({ id, authorId: `sample:${username}`, text, tags, createdAt: now - ago, reactions: Object.fromEntries(Array.from({ length: likes }, (_, i) => [`sample:fan${i}`, 'like'])), comments: [] });
  return [
    mk('seed-1', 'mikas', 'Finally understood the difference between DFA and NFA after making my own visual notes. Sharing this in case anyone needs it!', ['Automata Theory', 'Study tips'], 2 * H, 18),
    mk('seed-2', 'alexrivera', 'Small progress today: finished my Machine Learning reviewer and scored 9/10 on my practice quiz. Keep going, everyone!', ['Machine Learning', 'Progress'], 26 * H, 24),
    mk('seed-3', 'jordanlee', 'Looking for study buddies for our Computer Architecture exam next week. Anyone interested?', ['Study group'], 50 * H, 12),
  ];
}
