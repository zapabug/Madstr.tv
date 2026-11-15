import test from 'node:test';
import assert from 'node:assert/strict';
import { formatClock } from './clock.ts';

test('the clock shows hours and minutes, padded', () => {
  assert.equal(formatClock(new Date(2026, 10, 15, 14, 32, 59), 'en-GB'), '14:32');
  assert.equal(formatClock(new Date(2026, 10, 15, 7, 5), 'en-GB'), '07:05');
  assert.equal(formatClock(new Date(2026, 10, 15, 0, 0), 'en-GB'), '00:00');
});

test('12-hour systems keep their own format', () => {
  assert.match(formatClock(new Date(2026, 10, 15, 14, 32), 'en-US'), /^0?2:32\s?PM$/i);
});
