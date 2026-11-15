import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLiked, toggleLiked } from './liked.ts';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);

test('toggle adds newest first and removes on a second press', () => {
  assert.deepEqual(toggleLiked([], A), [A]);
  assert.deepEqual(toggleLiked([A], B), [B, A]);
  assert.deepEqual(toggleLiked([B, A], B), [A]);
});

test('anything that is not a 64-hex pubkey is ignored', () => {
  assert.deepEqual(toggleLiked([A], 'npub1xyz'), [A]);
  assert.deepEqual(toggleLiked([A], ''), [A]);
  assert.deepEqual(toggleLiked([A], 'A'.repeat(64)), [A], 'uppercase is not a valid pubkey here');
});

test('stored data is validated, deduped and survives garbage', () => {
  assert.deepEqual(parseLiked(JSON.stringify([A, B, A, 'x', 5, null])), [A, B]);
  assert.deepEqual(parseLiked('not json'), []);
  assert.deepEqual(parseLiked('{"a":1}'), []);
  assert.deepEqual(parseLiked(null), []);
});

test('the list is capped', () => {
  const many = Array.from({ length: 600 }, (_, i) => i.toString(16).padStart(64, '0'));
  assert.equal(parseLiked(JSON.stringify(many)).length, 500);
  assert.equal(toggleLiked(many.slice(0, 500), 'f'.repeat(64)).length, 500);
});
