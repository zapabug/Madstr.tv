import test from 'node:test';
import assert from 'node:assert/strict';
import { OK_HOLD_MS, OK_IDLE, okStep, type OkAct, type OkEvent } from './okKey.ts';

// Run a sequence of events and collect what OK did.
function run(events: OkEvent[]): OkAct[] {
  let state = OK_IDLE;
  const acts: OkAct[] = [];
  for (const e of events) {
    const out = okStep(state, e);
    state = out.state;
    if (out.act !== 'none') acts.push(out.act);
  }
  return acts;
}

test('a tap presses once, on release', () => {
  assert.deepEqual(run([{ type: 'down', t: 0 }]), [], 'nothing on the way down');
  assert.deepEqual(run([{ type: 'down', t: 0 }, { type: 'up', t: 120 }]), ['press']);
});

test('the TV repeats OK while held: no extra presses, one hold', () => {
  // What the Vestel TV sent: key-down every 50 ms, no repeat flag, then one key-up (spec: held 2 s on Previous).
  const held: OkEvent[] = [{ type: 'down', t: 0 }];
  for (let t = 50; t <= 2000; t += 50) held.push({ type: 'down', t });
  held.push({ type: 'up', t: 2010 });
  assert.deepEqual(run(held), ['hold']);
});

test('a short burst of repeats under the hold time is still one press', () => {
  assert.deepEqual(run([{ type: 'down', t: 0 }, { type: 'down', t: 450 }, { type: 'down', t: 500 }, { type: 'up', t: 560 }]), ['press']);
});

test('the timer tick fires the hold while OK is still down, even without repeats', () => {
  assert.deepEqual(run([{ type: 'down', t: 0 }, { type: 'tick', t: OK_HOLD_MS - 1 }]), []);
  assert.deepEqual(run([{ type: 'down', t: 0 }, { type: 'tick', t: OK_HOLD_MS }, { type: 'up', t: 900 }]), ['hold']);
});

test('a long press with no repeats and no tick is a hold on release, not a press', () => {
  assert.deepEqual(run([{ type: 'down', t: 0 }, { type: 'up', t: OK_HOLD_MS + 50 }]), ['hold']);
});

test('stray events do nothing', () => {
  assert.deepEqual(run([{ type: 'up', t: 10 }, { type: 'tick', t: 5000 }]), []);
  assert.deepEqual(run([{ type: 'down', t: 0 }, { type: 'up', t: 100 }, { type: 'up', t: 200 }]), ['press'], 'a second release is ignored');
});
