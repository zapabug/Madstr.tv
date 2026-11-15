import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTACT_RELAYS, CONTENT_RELAYS, LOOKUP_RELAYS, SIGNER_RELAYS } from './relays.ts';

const all = { CONTENT_RELAYS, LOOKUP_RELAYS, SIGNER_RELAYS, CONTACT_RELAYS };

test('every relay is a secure websocket address and appears once per list', () => {
  for (const [name, list] of Object.entries(all)) {
    assert.ok(list.length > 0, `${name} is not empty`);
    for (const url of list) assert.match(url, /^wss:\/\/[a-z0-9.-]+$/, `${name}: ${url}`);
    assert.equal(new Set(list).size, list.length, `${name} has a duplicate`);
  }
});

test('nothing relies on relay.nsec.app (it needs NIP-42 auth and silently answers nothing)', () => {
  for (const [name, list] of Object.entries(all)) {
    assert.ok(!list.some(url => url.includes('nsec.app')), `${name} must not include nsec.app`);
  }
});

test('the signer has several independent relays, so one bad relay cannot be the only one', () => {
  assert.ok(SIGNER_RELAYS.length >= 3);
});

test('follow lists are looked up on the index relays first, then the content relays', () => {
  assert.deepEqual(CONTACT_RELAYS.slice(0, LOOKUP_RELAYS.length), [...LOOKUP_RELAYS]);
  for (const url of CONTENT_RELAYS) assert.ok(CONTACT_RELAYS.includes(url));
});
