import test from 'node:test';
import assert from 'node:assert/strict';
import { keepNewest, reviveLengths } from './durations.ts';

test('reviveLengths: http(s) URLs with finite lengths only', () => {
  assert.deepEqual(reviveLengths([['https://x/a.mp3', 200], ['javascript:x', 5], ['https://x/b.mp3', -1], ['https://x/c.mp3', Infinity], 'x']), [['https://x/a.mp3', 200]]);
  assert.deepEqual(reviveLengths(null), []);
});

test('keepNewest keeps the last learned', () => {
  assert.deepEqual(keepNewest([['a', 1], ['b', 2], ['c', 3]], 2), [['b', 2], ['c', 3]]);
});
