import test from 'node:test';
import assert from 'node:assert/strict';
import { nextIndex, prevAction, resumeTime, formatTime, nextRate, rateKey, validRate } from './queue.ts';

test('next stops at the end of the queue', () => {
  assert.equal(nextIndex(0, 3), 1);
  assert.equal(nextIndex(2, 3), null);
  assert.equal(nextIndex(0, 0), null);
});

test('previous restarts a track that has been playing, else goes back', () => {
  assert.equal(prevAction(30, 2), 'restart');
  assert.equal(prevAction(2, 2), 'previous');
  assert.equal(prevAction(2, 0), 'restart', 'nothing before the first item');
});

test('resume skips the very start and the very end', () => {
  assert.equal(resumeTime(undefined, 600), 0);
  assert.equal(resumeTime(3, 600), 0);
  assert.equal(resumeTime(120, 600), 120);
  assert.equal(resumeTime(595, 600), 0);
  assert.equal(resumeTime(Number.NaN, 600), 0);
  assert.equal(resumeTime(500, Number.NaN), 500, 'unknown length keeps the saved spot');
});

test('time formatting', () => {
  assert.equal(formatTime(0), '0:00');
  assert.equal(formatTime(65), '1:05');
  assert.equal(formatTime(3725), '1:02:05');
  assert.equal(formatTime(Number.NaN), '0:00');
  assert.equal(formatTime(-4), '0:00');
});

test('playback rate cycles and recovers from an unknown value', () => {
  assert.equal(nextRate(1), 1.25);
  assert.equal(nextRate(0.75), 1);
  assert.equal(nextRate(3), 1, 'an unknown rate falls back to normal speed');
});

test('the saved speed lives under one key per queue label', () => {
  assert.equal(rateKey('Music'), 'madstr:rate:music');
  assert.equal(rateKey('Podcasts'), 'madstr:rate:podcasts');
  assert.equal(rateKey('Short videos'), 'madstr:rate:short-videos');
  assert.equal(rateKey('Keep watching'), 'madstr:rate:keep-watching');
  assert.notEqual(rateKey('Music'), rateKey('Podcasts'), 'music and podcasts remember separately');
});

test('a saved speed must be one of the known rates', () => {
  assert.equal(validRate(1.5), 1.5);
  assert.equal(validRate(1), 1);
  assert.equal(validRate(1.7), null, 'not a rate the button can show');
  assert.equal(validRate(Number.NaN), null);
  assert.equal(validRate('1.5'), null, 'localStorage strings come through Number() first');
  assert.equal(validRate(null), null);
});

// --- shuffle ---------------------------------------------------------------------------------
import { mergeShuffled, shuffleAround, unshuffle } from './queue.ts';

const items = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => ({ id }));
// A fixed "random" so the order is checkable; a seeded LCG.
const seeded = (seed = 7) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

test('shuffle keeps the playing item first and every other item once', () => {
  const { queue, index } = shuffleAround(items, 'c', seeded());
  assert.equal(index, 0);
  assert.equal(queue[0].id, 'c');
  assert.deepEqual(queue.map(i => i.id).sort(), ['a', 'b', 'c', 'd', 'e', 'f']);
  assert.notDeepEqual(queue.map(i => i.id), ['c', 'a', 'b', 'd', 'e', 'f'], 'the rest is actually reordered');
});

test('shuffle with nothing playing still shuffles everything', () => {
  const { queue, index } = shuffleAround(items, undefined, seeded());
  assert.equal(queue.length, items.length);
  assert.equal(index, 0);
  assert.deepEqual(shuffleAround([], undefined), { queue: [], index: -1 });
});

test('items that arrive while shuffled join at the end; gone ones drop out; order otherwise holds', () => {
  const now = shuffleAround(items, 'c', seeded()).queue;
  const natural = [...items.filter(i => i.id !== 'e'), { id: 'g' }, { id: 'h' }];
  const { queue, index } = mergeShuffled(now, natural, 'c', seeded(3));
  const kept = now.map(i => i.id).filter(id => id !== 'e');
  assert.deepEqual(queue.slice(0, kept.length).map(i => i.id), kept);
  assert.deepEqual(queue.slice(kept.length).map(i => i.id).sort(), ['g', 'h']);
  assert.equal(queue[index].id, 'c');
  assert.equal(queue.find(i => i.id === 'g'), natural.find(i => i.id === 'g'), 'the fresh item objects are used');
});

test('turning shuffle off goes back to the normal order, same item playing', () => {
  assert.deepEqual(unshuffle(items, 'd'), { queue: items, index: 3 });
});
