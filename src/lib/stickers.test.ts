import test from 'node:test';
import assert from 'node:assert/strict';
import { LANES, STICKERS, hrefOf } from './stickers.ts';
import { parseHash } from './route.ts';

test('every sticker opens the route it names', () => {
  for (const s of STICKERS) assert.deepEqual(parseHash(hrefOf(s)), s.route, s.id);
});

test('sticker ids are unique and every sticker sits in a lane the board shows', () => {
  assert.equal(new Set(STICKERS.map(s => s.id)).size, STICKERS.length);
  const lanes = new Set(LANES.map(l => l.id));
  for (const s of STICKERS) assert.ok(lanes.has(s.lane), s.id);
});

test('the board has the listen, watch and people lanes, each with a sticker', () => {
  assert.deepEqual(LANES.map(l => l.id), ['listen', 'watch', 'people']);
  for (const lane of LANES) assert.ok(STICKERS.some(s => s.lane === lane.id), lane.id);
});

test('Liked npubs stays dropped', () => {
  assert.equal(STICKERS.some(s => /liked/i.test(s.id + s.title)), false);
});
