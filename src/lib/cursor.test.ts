import test from 'node:test';
import assert from 'node:assert/strict';
import { CURSOR, edgePush, moveBy, speedAt } from './cursor.ts';

const screen = { width: 1280, height: 720 };

test('the numbers are the spec\'s (TV7-2, TV7-4)', () => {
  assert.equal(CURSOR.stepPx, 24);
  assert.equal(CURSOR.startPxPerS, 300);
  assert.equal(CURSOR.maxPxPerS, 1200);
  assert.equal(CURSOR.rampMs, 1000);
  assert.equal(CURSOR.edgePx, 48);
});

test('held, the speed rises from 300 to 1200 px/s over 1 s after the hold delay', () => {
  assert.equal(speedAt(0), 300);
  assert.equal(speedAt(CURSOR.holdDelayMs), 300);
  assert.equal(speedAt(CURSOR.holdDelayMs + 500), 750);
  assert.equal(speedAt(CURSOR.holdDelayMs + 1000), 1200);
  assert.equal(speedAt(60_000), 1200, 'never faster');
});

test('a tap moves 24 px; two arrows at once move diagonally', () => {
  assert.deepEqual(moveBy({ x: 100, y: 100 }, ['right'], 24, screen), { x: 124, y: 100 });
  assert.deepEqual(moveBy({ x: 100, y: 100 }, ['up', 'left'], 24, screen), { x: 76, y: 76 });
});

test('the pointer stays on screen', () => {
  assert.deepEqual(moveBy({ x: 5, y: 5 }, ['left', 'up'], 24, screen), { x: 0, y: 0 });
  assert.deepEqual(moveBy({ x: 1270, y: 715 }, ['right', 'down'], 24, screen), { x: 1279, y: 719 });
});

test('inside 48 px of an edge it pushes that way, elsewhere not', () => {
  assert.deepEqual(edgePush({ x: 640, y: 360 }, screen), { x: 0, y: 0 });
  assert.deepEqual(edgePush({ x: 640, y: 700 }, screen), { x: 0, y: 1 });
  assert.deepEqual(edgePush({ x: 10, y: 10 }, screen), { x: -1, y: -1 });
  assert.deepEqual(edgePush({ x: 1279 - 48, y: 360 }, screen), { x: 0, y: 0 }, 'just outside the zone');
});
