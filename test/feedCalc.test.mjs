// Run with: npm test  (Node's built-in test runner, no extra packages)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_POST, MAX_COMMENT, cleanText, parseTags, cleanPosts, sortPosts, postsBy,
  createPost, deletePost, toggleLike, addComment, deleteComment, timeAgo, seedPosts,
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
  assert.deepEqual(out.posts[0].tags, ['tag1', 'tag2']); assert.deepEqual(out.posts[0].likes, []);
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

test('toggleLike likes once, then unlikes', () => {
  const base = withPost(); const id = base[0].id;
  const on = toggleLike(base, id, 'b2'); assert.ok(on.liked); assert.deepEqual(on.posts[0].likes, ['b2']);
  const off = toggleLike(on.posts, id, 'b2'); assert.equal(off.liked, false); assert.deepEqual(off.posts[0].likes, []);
  assert.ok(toggleLike(base, 'nope', 'b2').error); assert.ok(toggleLike(base, id, '').error);
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
  assert.deepEqual(out[0].likes, []); assert.deepEqual(out[1].likes, ['a']); assert.deepEqual(out[1].tags, []); assert.equal(out[1].comments.length, 1);
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
