import test from 'node:test';
import assert from 'node:assert/strict';
import { createKeepAlive, KEEP_ALIVE_STOP_MS, keepsAlive, NOTE_FALLBACK, NOTE_TITLE_MAX, noteTitle } from './keepAlive.ts';

function rig() {
  const calls: string[] = [];
  const timers = new Map<number, { fn: () => void; ms: number }>();
  let next = 1;
  const ka = createKeepAlive({
    start: t => calls.push(`start:${t}`),
    stop: () => calls.push('stop'),
    setTimer: (fn, ms) => { const h = next++; timers.set(h, { fn, ms }); return h; },
    clearTimer: h => { timers.delete(h as number); },
  });
  const fire = () => { const all = [...timers.values()]; timers.clear(); all.forEach(t => t.fn()); };
  return { ka, calls, timers, fire };
}

test('keepsAlive: playing and loading only', () => {
  assert.deepEqual((['idle', 'loading', 'playing', 'paused', 'error'] as const).map(keepsAlive), [false, true, true, false, false]);
});

test('noteTitle: plain, one line, clipped, never empty', () => {
  assert.equal(noteTitle('  Song\n\tName\u202e '), 'Song Name');
  assert.equal(noteTitle(undefined), NOTE_FALLBACK);
  assert.equal(noteTitle('\u200b \n'), NOTE_FALLBACK);
  const long = noteTitle('x'.repeat(200));
  assert.equal(long.length, NOTE_TITLE_MAX);
  assert.ok(long.endsWith('…'));
});

test('starts once on play, updates only when the title changes', () => {
  const { ka, calls } = rig();
  ka.update('idle', undefined);
  ka.update('loading', 'A');
  ka.update('playing', 'A');
  ka.update('playing', 'A');
  ka.update('playing', 'B');
  assert.deepEqual(calls, ['start:A', 'start:B']);
});

test('stops 3 s after pausing', () => {
  const { ka, calls, timers, fire } = rig();
  ka.update('playing', 'A');
  ka.update('paused', 'A');
  ka.update('paused', 'A'); // no second timer
  assert.equal(timers.size, 1);
  assert.equal([...timers.values()][0].ms, KEEP_ALIVE_STOP_MS);
  fire();
  assert.deepEqual(calls, ['start:A', 'stop']);
  ka.update('playing', 'A');
  assert.deepEqual(calls, ['start:A', 'stop', 'start:A']);
});

test('a short pause between two tracks does not stop the service', () => {
  const { ka, calls, timers } = rig();
  ka.update('playing', 'A');
  ka.update('paused', 'A');
  ka.update('loading', 'B');
  assert.equal(timers.size, 0);
  assert.deepEqual(calls, ['start:A', 'start:B']);
});

test('never stops what it did not start', () => {
  const { ka, calls, timers } = rig();
  ka.update('paused', 'A');
  ka.update('error', 'A');
  assert.equal(timers.size, 0);
  assert.deepEqual(calls, []);
});
