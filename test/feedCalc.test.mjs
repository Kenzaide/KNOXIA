// Run with: npm test  (Node's built-in test runner, no extra packages)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_POST, MAX_COMMENT, REACTIONS, cleanText, parseTags, cleanPosts, sortPosts, postsBy,
  createPost, deletePost, react, reactionSummary, reactors, addComment, editComment, deleteComment, commentThreads, timeAgo, seedPosts,
} from '../src/feedCalc.js';

const T = 1_700_000_000_000;
const withPost = () => createPost([], 'a1', 'Hello feed', ['intro'], T).posts;

test('cleanText trims, collapses spaces and limits blank lines', () => {
  assert.equal(cleanText('  hi   there \n\n\n\n bye  '), 'hi there\n\nbye');
  assert.equal(cleanText(null), '');
});

test('parseTags cleans, dedupes and caps tags', () => {
  assert.deepEqual(parseTags('#ml, Study  tips, ML, , a, b'), ['ml', 'Study tips', 'a']);
  assert.deepEqual(parseTags(''), []);
  assert.equal(parseTags('x'.repeat(50))[0].length, 20);
});

test('createPost adds a clean post at the top', () => {
  const out = createPost(withPost(), 'b2', '  New   post ', 'tag1, tag2', T + 1000);
  assert.ok(out.ok); assert.equal(out.posts.length, 2); assert.equal(out.posts[0].text, 'New post');
  assert.deepEqual(out.posts[0].tags, ['tag1', 'tag2']); assert.deepEqual(out.posts[0].reactions, {});
  assert.notEqual(out.posts[0].id, out.posts[1].id);
});

test('createPost rejects empty, too long and signed-out posts without changing anything', () => {
  const base = withPost();
  for (const [a, t] of [['a1', '   '], ['a1', 'x'.repeat(MAX_POST + 1)], ['', 'hello']]) {
    const out = createPost(base, a, t, []); assert.ok(out.error); assert.equal(out.posts, base);
  }
});

test('only the author can delete a post', () => {
  const base = withPost(); const id = base[0].id;
  assert.ok(deletePost(base, id, 'b2').error);
  assert.equal(deletePost(base, id, 'a1').posts.length, 0);
  assert.ok(deletePost(base, 'nope', 'a1').error);
});

test('react sets, changes and removes your single reaction', () => {
  const base = withPost(); const id = base[0].id;
  const one = react(base, id, 'b2', 'like'); assert.equal(one.mine, 'like'); assert.deepEqual(one.posts[0].reactions, { b2: 'like' });
  const changed = react(one.posts, id, 'b2', 'celebrate'); assert.equal(changed.mine, 'celebrate'); assert.deepEqual(changed.posts[0].reactions, { b2: 'celebrate' });
  const gone = react(changed.posts, id, 'b2', 'celebrate'); assert.equal(gone.mine, ''); assert.deepEqual(gone.posts[0].reactions, {});
  assert.ok(react(base, 'nope', 'b2', 'like').error); assert.ok(react(base, id, '', 'like').error); assert.ok(react(base, id, 'b2', 'angry').error);
  assert.equal(react(base, id, 'b2').mine, 'like'); assert.deepEqual(base[0].reactions, {});
});

test('reactionSummary counts by type, most used first, and knows your own', () => {
  const post = { reactions: { a: 'like', b: 'insightful', c: 'insightful', d: 'motivated' } };
  const s = reactionSummary(post, 'c'); assert.equal(s.total, 4); assert.deepEqual(s.counts, { like: 1, insightful: 2, motivated: 1 });
  assert.deepEqual(s.top, ['insightful', 'like', 'motivated']); assert.equal(s.mine, 'insightful'); assert.equal(reactionSummary(post, 'zz').mine, '');
  assert.equal(reactionSummary({}, 'a').total, 0);
});

test('reactors lists who reacted in a steady order', () => {
  assert.deepEqual(reactors({ reactions: { b: 'celebrate', a: 'celebrate', c: 'like' } }), [{ userId: 'c', type: 'like' }, { userId: 'a', type: 'celebrate' }, { userId: 'b', type: 'celebrate' }]);
  assert.equal(REACTIONS[0].key, 'like');
});

test('addComment validates and appends in order', () => {
  const base = withPost(); const id = base[0].id;
  const one = addComment(base, id, 'b2', ' Nice! ', T + 1); assert.ok(one.ok); assert.equal(one.posts[0].comments[0].text, 'Nice!');
  const two = addComment(one.posts, id, 'c3', 'Thanks', T + 2); assert.deepEqual(two.posts[0].comments.map((c) => c.authorId), ['b2', 'c3']);
  assert.notEqual(two.posts[0].comments[0].id, two.posts[0].comments[1].id);
  assert.ok(addComment(base, id, 'b2', '  ').error); assert.ok(addComment(base, id, 'b2', 'x'.repeat(MAX_COMMENT + 1)).error);
  assert.ok(addComment(base, 'nope', 'b2', 'hi').error);
});

test('a comment can be deleted by its author or the post author, not others', () => {
  const base = withPost(); const id = base[0].id;
  const posts = addComment(base, id, 'b2', 'hi', T + 1).posts; const cid = posts[0].comments[0].id;
  assert.ok(deleteComment(posts, id, cid, 'c3').error);
  assert.equal(deleteComment(posts, id, cid, 'b2').posts[0].comments.length, 0);
  assert.equal(deleteComment(posts, id, cid, 'a1').posts[0].comments.length, 0);
});

test('cleanPosts drops broken records and repairs missing lists', () => {
  const good = { id: 'p1', authorId: 'a1', text: 'ok', createdAt: 5 };
  const out = cleanPosts([good, good, null, { id: 'x' }, { ...good, id: 'p2', likes: ['a', 'a', 3], tags: 'no', comments: [{}, { id: 'c', authorId: 'a', text: 't', createdAt: 1 }] }]);
  assert.deepEqual(out.map((p) => p.id), ['p1', 'p2']);
  assert.deepEqual(out[0].reactions, {}); assert.deepEqual(out[1].reactions, { a: 'like' }); assert.equal('likes' in out[1], false); assert.deepEqual(out[1].tags, []); assert.equal(out[1].comments.length, 1); assert.equal(out[1].comments[0].parentId, '');
  assert.deepEqual(cleanPosts('nope'), []);
});

test('sortPosts is newest first and does not change its input; postsBy filters by author', () => {
  const list = [{ id: 'a', authorId: 'x', createdAt: 1 }, { id: 'b', authorId: 'y', createdAt: 3 }, { id: 'c', authorId: 'x', createdAt: 2 }];
  assert.deepEqual(sortPosts(list).map((p) => p.id), ['b', 'c', 'a']); assert.equal(list[0].id, 'a');
  assert.deepEqual(postsBy(list, 'x').map((p) => p.id), ['a', 'c']);
});

test('timeAgo gives friendly labels', () => {
  assert.equal(timeAgo(T, T + 10_000), 'just now'); assert.equal(timeAgo(T, T + 60_000), '1 minute ago');
  assert.equal(timeAgo(T, T + 2 * 3600e3), '2 hours ago'); assert.equal(timeAgo(T, T + 30 * 3600e3), 'Yesterday');
  assert.equal(timeAgo(T, T + 3 * 86400e3), '3 days ago'); assert.equal(timeAgo(T, T - 5000), 'just now');
});

test('seed posts are valid, written by sample people, and newest first', () => {
  const seeds = seedPosts(T); assert.equal(seeds.length, 3); assert.equal(cleanPosts(seeds).length, 3);
  assert.ok(seeds.every((p) => p.authorId.startsWith('sample:')));
  assert.deepEqual(sortPosts(seeds).map((p) => p.id), seeds.map((p) => p.id));
});

test('cleanPosts keeps valid reactions, drops unknown ones, and drops orphaned or nested replies', () => {
  const c = (id, parentId) => ({ id, authorId: 'a', text: id, createdAt: 1, parentId });
  const [p] = cleanPosts([{ id: 'p', authorId: 'a', text: 't', createdAt: 1, likes: ['x'], reactions: { y: 'celebrate', z: 'angry', '': 'like' },
    comments: [c('c1', ''), c('c2', 'c1'), c('c3', 'c2'), c('c4', 'gone')] }]);
  assert.deepEqual(p.reactions, { x: 'like', y: 'celebrate' }); assert.deepEqual(p.comments.map((x) => x.id), ['c1', 'c2']);
});

test('replies attach to a top-level comment, one level deep', () => {
  const base = withPost(); const id = base[0].id;
  const top = addComment(base, id, 'b2', 'Question?', T + 1); const cid = top.comment.id;
  const reply = addComment(top.posts, id, 'a1', 'Answer', T + 2, cid); assert.ok(reply.ok); assert.equal(reply.comment.parentId, cid);
  assert.ok(addComment(reply.posts, id, 'c3', 'nested', T + 3, reply.comment.id).error);
  assert.ok(addComment(reply.posts, id, 'c3', 'orphan', T + 3, 'nope').error);
  assert.ok(addComment(reply.posts, id, 'c3', '   ', T + 3, cid).error);
  const threads = commentThreads(reply.posts[0]); assert.equal(threads.length, 1); assert.deepEqual(threads[0].replies.map((r) => r.text), ['Answer']);
});

test('commentThreads orders comments and replies oldest first', () => {
  const post = { comments: [{ id: 'b', createdAt: 5, parentId: '' }, { id: 'r2', createdAt: 9, parentId: 'a' }, { id: 'a', createdAt: 1, parentId: '' }, { id: 'r1', createdAt: 3, parentId: 'a' }] };
  const t = commentThreads(post); assert.deepEqual(t.map((c) => c.id), ['a', 'b']); assert.deepEqual(t[0].replies.map((c) => c.id), ['r1', 'r2']);
});

test('editComment: only the author, valid text, marks edited, no-op when unchanged', () => {
  const base = withPost(); const id = base[0].id; const posts = addComment(base, id, 'b2', 'Orig', T + 1).posts; const cid = posts[0].comments[0].id;
  assert.ok(editComment(posts, id, cid, 'a1', 'hacked').error);
  const ok = editComment(posts, id, cid, 'b2', '  New   text ', T + 9); assert.ok(ok.ok); assert.equal(ok.posts[0].comments[0].text, 'New text'); assert.equal(ok.posts[0].comments[0].editedAt, T + 9);
  const same = editComment(posts, id, cid, 'b2', 'Orig', T + 9); assert.ok(same.unchanged); assert.equal(same.posts, posts);
  assert.ok(editComment(posts, id, cid, 'b2', '   ').error); assert.ok(editComment(posts, id, cid, 'b2', 'x'.repeat(MAX_COMMENT + 1)).error); assert.ok(editComment(posts, id, 'nope', 'b2', 'hi').error);
});

test('deleting a comment also deletes its replies, but deleting a reply keeps the rest', () => {
  const base = withPost(); const id = base[0].id;
  let posts = addComment(base, id, 'b2', 'Top', T + 1).posts; const top = posts[0].comments[0].id;
  posts = addComment(posts, id, 'c3', 'R1', T + 2, top).posts; posts = addComment(posts, id, 'a1', 'R2', T + 3, top).posts; posts = addComment(posts, id, 'c3', 'Other', T + 4).posts;
  const r1 = posts[0].comments.find((c) => c.text === 'R1').id;
  assert.deepEqual(deleteComment(posts, id, r1, 'c3').posts[0].comments.map((c) => c.text), ['Top', 'R2', 'Other']);
  assert.deepEqual(deleteComment(posts, id, top, 'b2').posts[0].comments.map((c) => c.text), ['Other']);
  assert.ok(deleteComment(posts, id, r1, 'zz').error);
});

test('new comment ids stay unique after deletes within the same moment', () => {
  const base = withPost(); const id = base[0].id;
  let posts = addComment(base, id, 'b2', 'one', T).posts; posts = addComment(posts, id, 'b2', 'two', T).posts;
  posts = deleteComment(posts, id, posts[0].comments[0].id, 'b2').posts; posts = addComment(posts, id, 'b2', 'three', T).posts;
  assert.equal(new Set(posts[0].comments.map((c) => c.id)).size, posts[0].comments.length);
});
