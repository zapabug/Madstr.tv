import test from 'node:test';
import assert from 'node:assert/strict';
import { publishToFirst, type PublishResult } from './publishFirst.ts';

const later = (ms: number, result: PublishResult) => new Promise<PublishResult>(res => setTimeout(() => res(result), ms));
const never = () => new Promise<PublishResult>(() => {});

test('resolves at the first relay that accepts, without waiting for a slow one', async () => {
  const started = Date.now();
  const who = await publishToFirst(['wss://slow', 'wss://fast'], url => (url === 'wss://fast' ? later(10, { ok: true }) : never()), 5000);
  assert.equal(who, 'wss://fast');
  assert.ok(Date.now() - started < 500, 'did not wait for the hanging relay');
});

test('a relay that refuses or throws does not stop another one succeeding', async () => {
  const who = await publishToFirst(['a', 'b', 'c'], async url => {
    if (url === 'a') throw new Error('socket closed');
    if (url === 'b') return { ok: false, message: 'auth-required' };
    return { ok: true };
  });
  assert.equal(who, 'c');
});

test('rejects only when every relay failed, and says why', async () => {
  await assert.rejects(
    publishToFirst(['wss://a', 'wss://b'], async url => (url === 'wss://a' ? { ok: false, message: 'auth-required' } : Promise.reject(new Error('boom')))),
    /auth-required.*boom|boom.*auth-required/,
  );
});

test('relays that never answer run out of time', async () => {
  await assert.rejects(publishToFirst(['a', 'b'], never, 40), /timed out/);
});

test('a late success after a timeout still counts if nothing else answered first', async () => {
  const who = await publishToFirst(['slow', 'dead'], url => (url === 'slow' ? later(15, { ok: true }) : never()), 500);
  assert.equal(who, 'slow');
});

test('no relays is an error, not a hang', async () => {
  await assert.rejects(publishToFirst([], async () => ({ ok: true })), /No relays/);
});
