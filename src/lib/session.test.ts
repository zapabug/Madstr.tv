import test from 'node:test';
import assert from 'node:assert/strict';
import { clearSession, loadSession, parseCredential, saveSession, SESSION_KEY, type KV } from './session.ts';

const memory = (): KV & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); }, removeItem: k => { data.delete(k); } };
};
const blocked: KV = {
  getItem: () => { throw new Error('blocked'); },
  setItem: () => { throw new Error('blocked'); },
  removeItem: () => { throw new Error('blocked'); },
};

test('a session round-trips and clears', () => {
  const kv = memory();
  saveSession({ type: 'nip46', nbunksec: 'nbunksec1abc' }, kv);
  assert.deepEqual(loadSession(kv), { type: 'nip46', nbunksec: 'nbunksec1abc' });
  saveSession({ type: 'extension' }, kv);
  assert.deepEqual(loadSession(kv), { type: 'extension' });
  clearSession(kv);
  assert.equal(loadSession(kv), null);
});

test('blocked storage never throws', () => {
  assert.doesNotThrow(() => saveSession({ type: 'extension' }, blocked));
  assert.equal(loadSession(blocked), null);
  assert.doesNotThrow(() => clearSession(blocked));
  assert.equal(loadSession(null), null);
});

test('corrupt or wrong-shaped saved data is ignored', () => {
  const kv = memory();
  kv.setItem(SESSION_KEY, '{not json');
  assert.equal(loadSession(kv), null);
  kv.setItem(SESSION_KEY, JSON.stringify({ type: 'nip46', nbunksec: 'not-a-session' }));
  assert.equal(loadSession(kv), null, 'an nbunksec must look like one');
  kv.setItem(SESSION_KEY, JSON.stringify({ type: 'nip46' }));
  assert.equal(loadSession(kv), null);
  kv.setItem(SESSION_KEY, JSON.stringify({ type: 'other' }));
  assert.equal(loadSession(kv), null);
});

test('pasted credentials: bunker:// and nbunksec only', () => {
  assert.deepEqual(parseCredential('  bunker://abc?relay=wss://x  '), { kind: 'bunker', value: 'bunker://abc?relay=wss://x' });
  assert.deepEqual(parseCredential('nbunksec1qq'), { kind: 'nbunksec', value: 'nbunksec1qq' });
  assert.equal(parseCredential('https://example.com'), null);
  assert.equal(parseCredential('nsec1secretkey'), null, 'a private key is never accepted');
  assert.equal(parseCredential(''), null);
});
