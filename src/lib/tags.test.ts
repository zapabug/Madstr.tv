import test from 'node:test';
import assert from 'node:assert/strict';
import { addTag, normalizeTag, parseTags, removeTag } from './tags.ts';

test('tags are normalised: no #, lower case, safe characters only', () => {
  assert.equal(normalizeTag('#Music'), 'music');
  assert.equal(normalizeTag('  ##Pod-Cast_1 '), 'pod-cast_1');
  assert.equal(normalizeTag('has space'), null);
  assert.equal(normalizeTag('<script>'), null);
  assert.equal(normalizeTag(''), null);
  assert.equal(normalizeTag('x'.repeat(31)), null);
});

test('adding ignores duplicates and junk, and the list is capped', () => {
  assert.deepEqual(addTag([], '#a'), ['a']);
  assert.deepEqual(addTag(['a'], 'A'), ['a']);
  assert.deepEqual(addTag(['a'], '!!'), ['a']);
  const full = Array.from({ length: 12 }, (_, i) => `t${i}`);
  assert.equal(addTag(full, 'more').length, 12);
  assert.deepEqual(removeTag(['a', 'b'], 'a'), ['b']);
});

test('stored tags are validated per kind and survive garbage', () => {
  assert.deepEqual(parseTags(JSON.stringify({ audio: ['music', 'BAD TAG', 5], video: ['clips', 'clips'], image: 'nope' })), { audio: ['music'], video: ['clips'], image: [] });
  assert.deepEqual(parseTags('not json'), { audio: [], video: [], image: [] });
  assert.deepEqual(parseTags(null), { audio: [], video: [], image: [] });
  assert.deepEqual(parseTags('[1,2]'), { audio: [], video: [], image: [] });
});
