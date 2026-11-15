import test from 'node:test';
import assert from 'node:assert/strict';
import { DOUBLE_TAP_MS, createTapper, seekForSide } from './doubleTap.ts';

function harness() {
  const log: string[] = [];
  let pending: (() => void) | null = null;
  const tapper = createTapper({
    onSingle: t => log.push(`single@${t.x}`),
    onDouble: t => log.push(`double@${t.x}`),
    setTimer: fn => { pending = fn; return 1; },
    clearTimer: () => { pending = null; },
  });
  return { log, tapper, fire: () => { const fn = pending; pending = null; fn?.(); } };
}

test('one tap is a single tap once the wait is over', () => {
  const h = harness();
  h.tapper.tap({ x: 10, y: 10, t: 0 });
  assert.deepEqual(h.log, []);
  h.fire();
  assert.deepEqual(h.log, ['single@10']);
});

test('two quick close taps are one double tap and no single tap', () => {
  const h = harness();
  h.tapper.tap({ x: 10, y: 10, t: 0 });
  h.tapper.tap({ x: 20, y: 15, t: DOUBLE_TAP_MS - 50 });
  h.fire();
  assert.deepEqual(h.log, ['double@20']);
});

test('taps too slow or too far apart are two single taps', () => {
  const h = harness();
  h.tapper.tap({ x: 10, y: 10, t: 0 });
  h.fire();
  h.tapper.tap({ x: 10, y: 10, t: DOUBLE_TAP_MS + 100 });
  h.fire();
  h.tapper.tap({ x: 10, y: 10, t: 2000 });
  h.tapper.tap({ x: 300, y: 10, t: 2100 });
  h.fire();
  assert.deepEqual(h.log, ['single@10', 'single@10', 'single@10', 'single@300']);
});

test('seekForSide: left half back 10 s, right half forward 30 s', () => {
  assert.equal(seekForSide(100, 0, 1000), -10);
  assert.equal(seekForSide(499, 0, 1000), -10);
  assert.equal(seekForSide(500, 0, 1000), 30);
  assert.equal(seekForSide(1100, 200, 1000), 30);
});
