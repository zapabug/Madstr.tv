import test from 'node:test';
import assert from 'node:assert/strict';
import { friendsOfFollows, rankCreators } from './creators.ts';
import type { MediaItem } from './media.ts';

const item = (id: string, pubkey: string | undefined, createdAt: number, title = id): MediaItem =>
  ({ id, kind: 'audio', origin: 'nostr', url: 'u' + id, title, createdAt, pubkey });

test('most prolific creators first, newest title kept', () => {
  const out = rankCreators([item('1', 'p1', 10, 'old'), item('2', 'p1', 30, 'new'), item('3', 'p2', 20), item('4', 'p1', 5)], new Set());
  assert.deepEqual(out.map(c => [c.pubkey, c.count, c.latest, c.mutual]), [['p1', 3, 'new', 0], ['p2', 1, '3', 0]]);
});

test('people you already follow, and items without an author, are left out', () => {
  const out = rankCreators([item('1', 'p1', 1), item('2', 'p2', 2), item('3', undefined, 3)], new Set(['p1']));
  assert.deepEqual(out.map(c => c.pubkey), ['p2']);
});

test('ties go to the more recent poster, then pubkey, and the list is capped', () => {
  const out = rankCreators([item('1', 'pb', 10), item('2', 'pa', 10), item('3', 'pc', 20)], new Set());
  assert.deepEqual(out.map(c => c.pubkey), ['pc', 'pa', 'pb']);
  const many = Array.from({ length: 50 }, (_, i) => item(String(i), 'p' + i, i));
  assert.equal(rankCreators(many, new Set(), 30).length, 30);
});

test('friends of follows: counted once per list, excluding who you follow', () => {
  const lists = [['a', 'b', 'c', 'c'], ['b', 'c', 'x'], ['c', 'y']];
  const out = friendsOfFollows(lists, new Set(['x']));
  assert.deepEqual([...out.entries()], [['c', 3], ['b', 2], ['a', 1], ['y', 1]]);
  assert.equal(out.has('x'), false, 'someone you already follow is not a suggestion');
});

test('friends of follows are capped, strongest first', () => {
  const lists = [Array.from({ length: 10 }, (_, i) => 'p' + i), ['p5', 'p7']];
  const out = friendsOfFollows(lists, new Set(), 3);
  assert.equal(out.size, 3);
  assert.deepEqual([...out.keys()].slice(0, 2), ['p5', 'p7']);
});

test('creators that your follows follow come before more prolific strangers', () => {
  const mk = (id: string, pubkey: string, createdAt: number): MediaItem => ({ id, kind: 'audio', origin: 'nostr', url: 'u' + id, title: id, createdAt, pubkey });
  const items = [mk('1', 'stranger', 5), mk('2', 'stranger', 6), mk('3', 'stranger', 7), mk('4', 'friend', 1), mk('5', 'close', 2)];
  const out = rankCreators(items, new Set(), 30, new Map([['friend', 2], ['close', 5]]));
  assert.deepEqual(out.map(c => [c.pubkey, c.mutual]), [['close', 5], ['friend', 2], ['stranger', 0]]);
});
