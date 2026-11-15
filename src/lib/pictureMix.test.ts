import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_MIX, availableCount, ensureAhead, parseMix, pickNext, shareOf, step, type PictureMix } from './pictureMix.ts';

// a small deterministic random generator, so the share tests are repeatable
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; };
}
const mine = Array.from({ length: 20 }, (_, i) => `mine${i}`);
const others = Array.from({ length: 60 }, (_, i) => `other${i}`);
const share = (mix: PictureMix, n = 6000): number => {
  const rand = lcg(7); let m = 0; let recent: string[] = [];
  for (let i = 0; i < n; i++) { const u = pickNext(mine, others, mix, recent, rand) as string; if (u.startsWith('mine')) m++; recent = [...recent, u].slice(-12); }
  return m / n;
};

test('seldom is about 1 in 20, very often about 4 in 5', () => {
  assert.equal(shareOf(0), 0.05);
  assert.equal(shareOf(1), 0.8);
  assert.ok(Math.abs(shareOf(0.5) - 0.425) < 1e-9);
  assert.equal(shareOf(-3), 0.05);
  assert.equal(shareOf(9), 0.8);
});

test('the slider really changes how often yours come up', () => {
  const seldom = share({ onlyMine: false, often: 0 });
  const middle = share({ onlyMine: false, often: 0.5 });
  const often = share({ onlyMine: false, often: 1 });
  assert.ok(seldom > 0.02 && seldom < 0.09, `seldom ${seldom}`);
  assert.ok(middle > 0.37 && middle < 0.48, `middle ${middle}`);
  assert.ok(often > 0.75 && often < 0.85, `often ${often}`);
});

test('only mine means only mine, whatever the slider says', () => {
  const rand = lcg(3);
  for (let i = 0; i < 200; i++) assert.ok((pickNext(mine, others, { onlyMine: true, often: 0 }, [], rand) as string).startsWith('mine'));
});

test('with nothing of yours, the slideshow shows; with nothing else, yours show; with neither, nothing', () => {
  assert.ok((pickNext([], others, { onlyMine: true, often: 1 }, []) as string).startsWith('other'), 'only mine but I have none: show the slideshow');
  assert.ok((pickNext(mine, [], DEFAULT_MIX, []) as string).startsWith('mine'));
  assert.equal(pickNext([], [], DEFAULT_MIX, []), null);
});

test('a picture is not repeated while there is something else to show', () => {
  const pool = ['a', 'b', 'c'];
  const rand = lcg(11);
  for (let i = 0; i < 100; i++) {
    const pick = pickNext(pool, [], DEFAULT_MIX, ['a', 'b'], rand);
    assert.equal(pick, 'c');
  }
  assert.ok(['a', 'b', 'c'].includes(pickNext(pool, [], DEFAULT_MIX, ['a', 'b', 'c']) as string), 'everything recent: pick any');
});

test('how many pictures can be shown', () => {
  assert.equal(availableCount(5, 40, { onlyMine: false, often: 0.5 }), 45);
  assert.equal(availableCount(5, 40, { onlyMine: true, often: 0.5 }), 5);
  assert.equal(availableCount(0, 40, { onlyMine: true, often: 0.5 }), 40);
});

test('saved settings are validated', () => {
  assert.deepEqual(parseMix(null), DEFAULT_MIX);
  assert.deepEqual(parseMix('junk'), DEFAULT_MIX);
  assert.deepEqual(parseMix('{"onlyMine":true,"often":0.9}'), { onlyMine: true, often: 0.9 });
  assert.deepEqual(parseMix('{"onlyMine":"yes","often":7}'), { onlyMine: false, often: 1 });
  assert.deepEqual(parseMix('{"often":"x"}'), DEFAULT_MIX);
});

test('the history keeps one ahead, steps both ways and stays inside its bounds', () => {
  let h = ensureAhead({ urls: [], cursor: 0 }, 'a');
  assert.deepEqual(h, { urls: ['a'], cursor: 0 });
  h = ensureAhead(h, 'b');
  assert.deepEqual(h, { urls: ['a', 'b'], cursor: 0 });
  assert.equal(ensureAhead(h, 'c'), h, 'already one ahead: nothing added');
  h = step(h, 1);
  assert.equal(h.cursor, 1);
  assert.equal(step(h, 1), h, 'cannot step past the end');
  assert.equal(step(step(h, -1), -1).cursor, 0, 'cannot step before the start');
  assert.equal(ensureAhead({ urls: ['a'], cursor: 0 }, null).urls.length, 1);
});

test('the history is capped and the cursor follows', () => {
  let h = { urls: Array.from({ length: 60 }, (_, i) => 'u' + i), cursor: 59 };
  h = ensureAhead(h, 'new');
  assert.equal(h.urls.length, 60);
  assert.equal(h.urls[h.cursor], 'u59');
  assert.equal(h.urls[h.urls.length - 1], 'new');
});
