import test from 'node:test';
import assert from 'node:assert/strict';
import { askForKeyUntilAnswered, reconnect, withTimeout, type RemoteLike } from './reconnect.ts';

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

// --- askForKeyUntilAnswered -----------------------------------------------------------------
// The 5 s production pacing is injected so tests can run on real timers in milliseconds.

test('a key request answered on the first try resolves at once', async () => {
  const key = await askForKeyUntilAnswered({ getPublicKey: async () => 'a'.repeat(64) }, 1_000, 50);
  assert.equal(key, 'a'.repeat(64));
});

test('a lost first request is repeated until an answer arrives', async () => {
  let calls = 0;
  const key = await askForKeyUntilAnswered(
    {
      getPublicKey: () => {
        calls += 1;
        // the first two asks are lost (the relay dropped them); the third gets an answer
        return calls < 3 ? Promise.reject(new Error('no subscriber')) : Promise.resolve('b'.repeat(64));
      },
    },
    1_000,
    20,
  );
  assert.equal(key, 'b'.repeat(64));
  assert.equal(calls, 3);
});

test('giving up produces a clear error, not a library timeout message', async () => {
  await assert.rejects(
    askForKeyUntilAnswered({ getPublicKey: () => new Promise(() => {}) }, 80, 20),
    /did not answer the key request in time/,
  );
});
