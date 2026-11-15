import test from 'node:test';
import assert from 'node:assert/strict';
import { nextIndex, prevAction, resumeTime, formatTime, nextRate } from './queue.ts';

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
