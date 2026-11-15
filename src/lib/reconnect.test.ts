import test from 'node:test';
import assert from 'node:assert/strict';
import { reconnect, withTimeout, type RemoteLike } from './reconnect.ts';

const fake = (connect: () => Promise<unknown>): RemoteLike & { opened: number } => {
  const remote = { isConnected: false, opened: 0, connect, open: async () => { remote.opened += 1; } };
  return remote;
};

test('a normal connect needs nothing more', async () => {
  const remote = fake(async () => 'ack');
  await reconnect(remote, ['get_public_key']);
  assert.equal(remote.opened, 0);
});

test('Amber answering "already connected" counts as connected: reopen and carry on', async () => {
  const remote = fake(async () => { throw new Error('already connected'); });
  await reconnect(remote, []);
  assert.equal(remote.isConnected, true);
  assert.equal(remote.opened, 1);
});

test('any other failure is a real failure', async () => {
  const remote = fake(async () => { throw new Error('unauthorized'); });
  await assert.rejects(reconnect(remote, []), /unauthorized/);
  assert.equal(remote.opened, 0);
});

test('a signer that never answers times out', async () => {
  const remote = fake(() => new Promise(() => {}));
  await assert.rejects(reconnect(remote, [], 30), /Signer connect timed out/);
  await assert.rejects(withTimeout(new Promise(() => {}), 20, 'x'), /x timed out/);
});
