import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceWalk, batchesWanted, fingerprint, freshWalk, openRequests, parseWalk, pickWalk, storeWalk } from './walk.ts';

test('batchesWanted: one on opening, one more per 30 dropped', () => {
  assert.equal(batchesWanted(0), 1);
  assert.equal(batchesWanted(29), 1);
  assert.equal(batchesWanted(30), 2);
  assert.equal(batchesWanted(95), 4);
  assert.equal(batchesWanted(-5), 1);
});

test('fingerprint: stable, and different for different keys', () => {
  assert.equal(fingerprint('abc'), fingerprint('abc'));
  assert.notEqual(fingerprint('abc'), fingerprint('abd'));
});

test('parseWalk: a stored walk for the same key carries on; anything else starts over', () => {
  const stored = { key: 'k', until: [100, null], finished: [false, true] };
  assert.deepEqual(parseWalk(stored, 'k', 2), stored);
  assert.deepEqual(parseWalk(stored, 'other', 2), freshWalk('other', 2));
  assert.deepEqual(parseWalk(stored, 'k', 3), freshWalk('k', 3));
  assert.deepEqual(parseWalk({ key: 'k', until: ['x', -1], finished: [1, true] }, 'k', 2), { key: 'k', until: [null, null], finished: [false, true] });
  assert.deepEqual(parseWalk(null, 'k', 1), freshWalk('k', 1));
});

test('advanceWalk: before the oldest returned, finished when nothing came back; only the asked ones move', () => {
  const w = advanceWalk(freshWalk('k', 3), [500, null, 7], [0, 1]);
  assert.deepEqual(w.until, [499, null, null]);
  assert.deepEqual(w.finished, [false, true, false]);
  assert.deepEqual(openRequests(w), [0, 2]);
});

test('storeWalk / pickWalk: one walk per key, the most recently used few kept', () => {
  let map: unknown = null;
  map = storeWalk(map, { key: 'tv', until: [5], finished: [false] }, 1);
  map = storeWalk(map, { key: 'me', until: [9], finished: [false] }, 2);
  assert.deepEqual(pickWalk(map, 'tv', 1).until, [5]); // the TV's walk did not overwrite mine, nor mine the TV's
  assert.deepEqual(pickWalk(map, 'me', 1).until, [9]);
  for (let i = 0; i < 5; i++) map = storeWalk(map, { key: `k${i}`, until: [1], finished: [false] }, 10 + i, 4);
  assert.equal(Object.keys(map as object).length, 4);
  assert.deepEqual(pickWalk(map, 'me', 1), freshWalk('me', 1));
  assert.deepEqual(pickWalk('junk', 'x', 1), freshWalk('x', 1));
  // finished is for one visit only
  map = storeWalk(map, { key: 'done', until: [3], finished: [true] }, 20);
  assert.deepEqual(pickWalk(map, 'done', 1), { key: 'done', until: [3], finished: [false] });
});
