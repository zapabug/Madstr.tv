import test from 'node:test';
import assert from 'node:assert/strict';
import { categoryOf, friendsOfFollows, rankCreators, type Category } from './creators.ts';
import type { MediaItem } from './media.ts';

const mk = (id: string, pubkey: string | undefined, createdAt: number, extra: Partial<MediaItem> = {}): MediaItem =>
  ({ id, kind: 'audio', origin: 'nostr', url: 'u' + id, title: id, createdAt, pubkey, ...extra });

test('every item falls in exactly one of the five categories', () => {
  assert.equal(categoryOf(mk('a', 'p', 1, { kind: 'image' })), 'images');
  assert.equal(categoryOf(mk('a', 'p', 1, { kind: 'video', short: false })), 'videos');
  assert.equal(categoryOf(mk('a', 'p', 1, { kind: 'video', short: true })), 'shorts');
  assert.equal(categoryOf(mk('a', 'p', 1, { duration: 200 })), 'music');
  assert.equal(categoryOf(mk('a', 'p', 1, { duration: 3000 })), 'podcasts');
  assert.equal(categoryOf(mk('a', 'p', 1, { origin: 'rss' })), 'podcasts');
});

test('creators carry a count per category and the newest title', () => {
  const out = rankCreators([mk('1', 'p1', 10, { kind: 'image' }), mk('2', 'p1', 30, { kind: 'video', short: true }), mk('3', 'p1', 5, { duration: 100 })], new Set());
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].counts, { images: 1, videos: 0, podcasts: 0, music: 1, shorts: 1 });
  assert.equal(out[0].total, 3);
  assert.equal(out[0].latest, '2');
});

test('picking a category keeps only people who publish it, most of it first', () => {
  const items = [mk('1', 'a', 1, { kind: 'image' }), mk('2', 'a', 2, { kind: 'image' }), mk('3', 'b', 3, { kind: 'image' }), mk('4', 'c', 4, { duration: 100 }), mk('5', 'c', 5, { duration: 100 }), mk('6', 'c', 6, { duration: 100 })];
  const images = rankCreators(items, new Set(), 30, new Map(), 'images');
  assert.deepEqual(images.map(c => c.pubkey), ['a', 'b'], 'c has no images; a has the most');
  const all = rankCreators(items, new Set());
  assert.deepEqual(all.map(c => c.pubkey), ['c', 'a', 'b'], 'overall, by everything published');
  const cats: Category[] = ['videos', 'podcasts', 'shorts'];
  for (const cat of cats) assert.deepEqual(rankCreators(items, new Set(), 30, new Map(), cat), [], `${cat}: nobody here publishes it`);
});

test('people you already follow, and items without an author, are left out', () => {
  const out = rankCreators([mk('1', 'p1', 1), mk('2', 'p2', 2), mk('3', undefined, 3)], new Set(['p1']));
  assert.deepEqual(out.map(c => c.pubkey), ['p2']);
});

test('inside the friends group the most prolific leads; the follower count only breaks ties', () => {
  const items = [mk('1', 'busy', 1, { kind: 'image' }), mk('2', 'busy', 2, { kind: 'image' }), mk('3', 'busy', 3, { kind: 'image' }), mk('4', 'popular', 4, { kind: 'image' })];
  const out = rankCreators(items, new Set(), 30, new Map([['busy', 2], ['popular', 13]]), 'images');
  assert.deepEqual(out.map(c => c.pubkey), ['busy', 'popular'], '3 images beat 1, even though 13 of your follows follow popular');
  const tie = rankCreators([mk('5', 'a', 1), mk('6', 'b', 2)], new Set(), 30, new Map([['a', 1], ['b', 4]]));
  assert.deepEqual(tie.map(c => c.pubkey), ['b', 'a'], 'equal output: more of your follows follow b');
});

test('friends of your follows come before more prolific strangers, in every category', () => {
  const items = [mk('1', 'stranger', 5), mk('2', 'stranger', 6), mk('3', 'stranger', 7), mk('4', 'friend', 1), mk('5', 'close', 2)];
  const out = rankCreators(items, new Set(), 30, new Map([['friend', 2], ['close', 5]]));
  assert.deepEqual(out.map(c => [c.pubkey, c.mutual]), [['close', 5], ['friend', 2], ['stranger', 0]]);
});

test('ties go to the more recent poster, then pubkey, and the list is capped', () => {
  const out = rankCreators([mk('1', 'pb', 10), mk('2', 'pa', 10), mk('3', 'pc', 20)], new Set());
  assert.deepEqual(out.map(c => c.pubkey), ['pc', 'pa', 'pb']);
  const many = Array.from({ length: 50 }, (_, i) => mk(String(i), 'p' + i, i));
  assert.equal(rankCreators(many, new Set(), 30).length, 30);
});

test('friends of follows: counted once per list, excluding who you follow, capped', () => {
  const lists = [['a', 'b', 'c', 'c'], ['b', 'c', 'x'], ['c', 'y']];
  const out = friendsOfFollows(lists, new Set(['x']));
  assert.deepEqual([...out.entries()], [['c', 3], ['b', 2], ['a', 1], ['y', 1]]);
  assert.equal(friendsOfFollows([Array.from({ length: 10 }, (_, i) => 'p' + i), ['p5', 'p7']], new Set(), 3).size, 3);
});
