import test from 'node:test';
import assert from 'node:assert/strict';
import { back, onBack } from './backStack.ts';

test('Back closes the newest pop-up first, then reports none', () => {
  const closed: string[] = [];
  onBack(() => closed.push('picker'));
  onBack(() => closed.push('qr'));
  assert.equal(back(), 'closed');
  assert.equal(back(), 'closed');
  assert.equal(back(), 'none');
  assert.deepEqual(closed, ['qr', 'picker']);
});

test('a pop-up that closed on its own leaves nothing behind', () => {
  const closed: string[] = [];
  const done = onBack(() => closed.push('qr'));
  done();
  assert.equal(back(), 'none');
  assert.deepEqual(closed, []);
});
