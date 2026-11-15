import test from 'node:test';
import assert from 'node:assert/strict';
import { rankCreators } from './creators.ts';
import type { MediaItem } from './media.ts';

const item = (id: string, pubkey: string | undefined, createdAt: number, title = id): MediaItem =>
  ({ id, kind: 'audio', origin: 'nostr', url: 'u' + id, title, createdAt, pubkey });

test('most prolific creators first, newest title kept', () => {
  const out = rankCreators([item('1', 'p1', 10, 'old'), item('2', 'p1', 30, 'new'), item('3', 'p2', 20), item('4', 'p1', 5)], new Set());
  assert.deepEqual(out.map(c => [c.pubkey, c.count, c.latest]), [['p1', 3, 'new'], ['p2', 1, '3']]);
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
