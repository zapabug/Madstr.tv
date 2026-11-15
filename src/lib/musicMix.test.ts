import test from 'node:test';
import assert from 'node:assert/strict';
import type { MediaItem } from './media.ts';
import { DEFAULT_OFTEN, mixMusic, parseOften, shareOfMine } from './musicMix.ts';

const items = (prefix: string, n: number): MediaItem[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, kind: 'audio', origin: prefix === 'L' ? 'local' : 'nostr', url: `https://x/${prefix}${i}.mp3`, title: `${prefix}${i}`, createdAt: 1 }) as MediaItem);
const ids = (list: MediaItem[]) => list.map(i => i.id);

test('parseOften: default none, clamped, steps of 10 %, bad input is the default', () => {
  assert.equal(parseOften(null), DEFAULT_OFTEN);
  assert.equal(DEFAULT_OFTEN, 0);
  assert.equal(parseOften('{"often":0.53}'), 0.5);
  assert.equal(parseOften('{"often":7}'), 1);
  assert.equal(parseOften('{"often":-1}'), 0);
  assert.equal(parseOften('{"often":"x"}'), 0);
  assert.equal(parseOften('nope'), 0);
});

test('none: Music is exactly the others', () => {
  const others = items('N', 5);
  assert.deepEqual(ids(mixMusic(others, items('L', 5), 0)), ids(others));
  assert.deepEqual(ids(mixMusic(others, [], 1)), ids(others));
});

test('middle: about 4 in 10 are yours, spread evenly, each side in order', () => {
  const mixed = mixMusic(items('N', 30), items('L', 30), 0.5);
  const first10 = mixed.slice(0, 10).filter(i => i.origin === 'local').length;
  assert.equal(shareOfMine(0.5), 0.4);
  assert.equal(first10, 4);
  const mineIds = mixed.filter(i => i.origin === 'local').map(i => i.id);
  assert.deepEqual(mineIds, mineIds.slice().sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))));
  // never two of yours in a row at 40 %
  for (let i = 1; i < 20; i++) assert.ok(!(mixed[i].origin === 'local' && mixed[i - 1].origin === 'local'));
});

test('lots: 8 in 10; when one side runs out the rest is the other; nothing lost or doubled', () => {
  const mixed = mixMusic(items('N', 3), items('L', 20), 1);
  assert.equal(mixed.length, 23);
  assert.equal(new Set(ids(mixed)).size, 23);
  assert.equal(mixMusic(items('N', 50), items('L', 50), 1).slice(0, 10).filter(i => i.origin === 'local').length, 8);
  const fewMine = mixMusic(items('N', 10), items('L', 1), 1);
  assert.equal(fewMine.length, 11);
  assert.equal(fewMine.filter(i => i.origin === 'local').length, 1);
});
