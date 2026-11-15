import test from 'node:test';
import assert from 'node:assert/strict';
import { authorSpot } from './author.ts';
import type { MediaItem } from './media.ts';

const base: MediaItem = { id: 'a', kind: 'audio', origin: 'nostr', url: 'u', title: 't', createdAt: 1 };

test('Nostr music shows the account profile image', () => {
  assert.deepEqual(authorSpot({ ...base, pubkey: 'ab'.repeat(32), subtitle: 'NOVA' }), { kind: 'profile', pubkey: 'ab'.repeat(32), label: 'NOVA' });
  assert.equal(authorSpot({ ...base }).kind, 'none', 'no account, nothing to show');
});

test('a podcast shows the show cover, or its first letter without one', () => {
  assert.deepEqual(authorSpot({ ...base, origin: 'rss', image: 'https://x/c.jpg', subtitle: 'The Daily' }), { kind: 'cover', image: 'https://x/c.jpg', label: 'The Daily' });
  assert.deepEqual(authorSpot({ ...base, origin: 'rss', subtitle: 'the daily' }), { kind: 'initial', letter: 'T', label: 'the daily' });
  assert.equal(authorSpot({ ...base, origin: 'rss' }).kind, 'initial');
});

test('local files get the folder placeholder, nothing playing gets nothing', () => {
  assert.deepEqual(authorSpot({ ...base, origin: 'local' }), { kind: 'folder', label: 'Local file' });
  assert.deepEqual(authorSpot(undefined), { kind: 'none' });
});
