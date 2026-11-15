import test from 'node:test';
import assert from 'node:assert/strict';
import type { MediaItem } from './media.ts';
import {
  EMPTY_TASTE, MAX_VOTES, applyTaste, newestEntries, parseTaste, withArtistBack, withDownVote, withHiddenArtist,
  withHiddenSong, withSongBack, withUpVote, withoutVote,
} from './taste.ts';
import { eventIdOf, likeTemplate, unlikeTemplate } from './reaction.ts';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const item = (id: string, pubkey?: string): MediaItem => ({ id, kind: 'audio', origin: 'nostr', url: `https://x/${id}.mp3`, title: id, pubkey, createdAt: 1 });
const ids = (list: MediaItem[]) => list.map(i => i.id);

test('applyTaste: nothing set leaves the list as it is', () => {
  const list = [item('1'), item('2')];
  assert.equal(applyTaste(list, EMPTY_TASTE), list);
});

test('applyTaste: hidden songs and hidden artists leave, down votes go to the end in order', () => {
  const list = [item('1', A), item('2', B), item('3', B), item('4'), item('5', A), item('6')];
  let t = withHiddenSong(EMPTY_TASTE, item('4'), 1);
  t = withHiddenArtist(t, A, 'Ann', 1);
  t = withDownVote(t, '2', 1);
  assert.deepEqual(ids(applyTaste(list, t)), ['3', '6', '2']);
  assert.deepEqual(ids(applyTaste(list, withArtistBack(withSongBack(t, '4'), A))), ['1', '3', '4', '5', '6', '2']);
});

test('votes: up and down replace each other; withoutVote clears both', () => {
  let t = withUpVote(EMPTY_TASTE, 'x', 5, 'c'.repeat(64));
  assert.equal(t.up.x.reaction, 'c'.repeat(64));
  t = withDownVote(t, 'x', 6);
  assert.equal(t.up.x, undefined);
  assert.equal(t.down.x, 6);
  t = withUpVote(t, 'x', 7);
  assert.equal(t.down.x, undefined);
  assert.deepEqual(withoutVote(t, 'x'), EMPTY_TASTE);
});

test('newestEntries keeps the newest by time', () => {
  assert.deepEqual(Object.keys(newestEntries({ a: 1, b: 3, c: 2 }, 2, v => v)).sort(), ['b', 'c']);
});

test('parseTaste: bad input is empty; bad entries are dropped; names clipped; votes capped', () => {
  assert.deepEqual(parseTaste(null), EMPTY_TASTE);
  assert.deepEqual(parseTaste('x'), EMPTY_TASTE);
  const t = parseTaste({
    up: { ok: { at: 1, reaction: 'nothex' }, bad: { at: 'x' } },
    down: { d: 2, e: -1 },
    songs: { s: { name: `  Song  ${'x'.repeat(300)}`, at: 3 }, t: { at: 'no' } },
    artists: { [A]: { name: 'Ann', at: 4 }, nothex: { name: 'x', at: 1 } },
  });
  assert.deepEqual(t.up, { ok: { at: 1 } });
  assert.deepEqual(t.down, { d: 2 });
  assert.deepEqual(Object.keys(t.songs), ['s']);
  assert.ok(t.songs.s.name.startsWith('Song x') && t.songs.s.name.length <= 160);
  assert.deepEqual(Object.keys(t.artists), [A]);
  const many = Object.fromEntries(Array.from({ length: MAX_VOTES + 5 }, (_, i) => [`i${i}`, i]));
  const capped = parseTaste({ down: many });
  assert.equal(Object.keys(capped.down).length, MAX_VOTES);
  assert.equal(capped.down.i0, undefined);
});

test('withHiddenArtist ignores a key that is not a pubkey', () => {
  assert.equal(withHiddenArtist(EMPTY_TASTE, 'nope', 'x', 1), EMPTY_TASTE);
});

test('eventIdOf: only nostr item ids with a hex id', () => {
  assert.equal(eventIdOf(`nostr:${A}`), A);
  assert.equal(eventIdOf('rss:abc'), undefined);
  assert.equal(eventIdOf('nostr:xyz'), undefined);
});

test('likeTemplate: NIP-25 tags, plus an address for addressable tracks; unlike is a NIP-09 deletion', () => {
  const like = likeTemplate({ id: A, pubkey: B, kind: 1, tags: [] }, 100);
  assert.deepEqual(like, { kind: 7, content: '+', tags: [['e', A, '', B], ['p', B], ['k', '1']], created_at: 100 });
  const track = likeTemplate({ id: A, pubkey: B, kind: 31337, tags: [['d', 'song-1']] }, 100);
  assert.deepEqual(track.tags.at(-1), ['a', `31337:${B}:song-1`]);
  assert.deepEqual(unlikeTemplate(A, 5), { kind: 5, content: '', tags: [['e', A], ['k', '7']], created_at: 5 });
});
