import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeOrder, shuffled, wrapIndex } from './shuffle.ts';

const seq = (values: number[]) => { let i = 0; return () => values[i++ % values.length]; };

test('shuffle keeps every item and does not touch the input', () => {
  const input = [1, 2, 3, 4, 5, 6];
  const out = shuffled(input, seq([0.9, 0.1, 0.5, 0.3, 0.7]));
  assert.deepEqual([...out].sort(), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(input, [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(shuffled([], Math.random), []);
});

test('merging keeps the existing order and appends new pictures', () => {
  const out = mergeOrder(['b', 'a', 'c'], ['a', 'b', 'c', 'd', 'e'], seq([0.2]));
  assert.deepEqual(out.slice(0, 3), ['b', 'a', 'c'], 'existing order is untouched');
  assert.deepEqual(out.slice(3).sort(), ['d', 'e']);
});

test('merging drops pictures that went away and ignores duplicates', () => {
  assert.deepEqual(mergeOrder(['a', 'b', 'c'], ['c', 'a']), ['a', 'c']);
  assert.deepEqual(mergeOrder([], ['x', 'x', 'y']).sort(), ['x', 'y']);
  assert.deepEqual(mergeOrder(['a'], []), []);
});

test('index wraps in both directions and survives an empty list', () => {
  assert.equal(wrapIndex(3, 3), 0);
  assert.equal(wrapIndex(-1, 3), 2);
  assert.equal(wrapIndex(1, 3), 1);
  assert.equal(wrapIndex(5, 0), 0);
});
