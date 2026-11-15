import test from 'node:test';
import assert from 'node:assert/strict';
import { FORWARD_S, REWIND_S, runAction, type Controllable } from './mediaActions.ts';

function fake() {
  const calls: string[] = [];
  const p: Controllable = {
    play: () => calls.push('play'), pause: () => calls.push('pause'), toggle: () => calls.push('toggle'),
    next: () => calls.push('next'), prev: () => calls.push('prev'),
    seek: s => calls.push(`seek:${s}`), seekBy: d => calls.push(`seekBy:${d}`),
  };
  return { p, calls };
}

test('each action drives the page player', () => {
  const { p, calls } = fake();
  for (const a of ['play', 'pause', 'toggle', 'next', 'previous', 'forward', 'rewind', 'stop']) runAction(p, a);
  runAction(p, 'seek', 42.5);
  assert.deepEqual(calls, ['play', 'pause', 'toggle', 'next', 'prev', `seekBy:${FORWARD_S}`, `seekBy:${-REWIND_S}`, 'pause', 'seek:42.5']);
});

test('unknown actions and bad seek positions are ignored', () => {
  const { p, calls } = fake();
  assert.equal(runAction(p, 'explode'), false);
  assert.equal(runAction(p, 42), false);
  assert.equal(runAction(p, 'seek'), false);
  assert.equal(runAction(p, 'seek', -1), false);
  assert.equal(runAction(p, 'seek', Number.NaN), false);
  assert.equal(runAction(p, 'seek', '10'), false);
  assert.deepEqual(calls, []);
});
