import test from 'node:test';
import assert from 'node:assert/strict';
import { CALLBACK_PARAM, loginLink, readAnswer, safeReturn } from './signerCallback.ts';

const HEX = '3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d';
const NPUB = 'npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6';

test('the login link asks for the public key and comes back to the page', () => {
  const link = loginLink('https://pleb.world/jukestr/');
  assert.ok(link.startsWith('nostrsigner:?'));
  const query = new URLSearchParams(link.slice('nostrsigner:?'.length));
  assert.equal(query.get('type'), 'get_public_key');
  assert.equal(query.get('returnType'), 'signature');
  assert.equal(query.get('compressionType'), 'none');
  assert.equal(query.get('callbackUrl'), `https://pleb.world/jukestr/?${CALLBACK_PARAM}=`);
});

test('the answer: hex or npub becomes hex', () => {
  assert.equal(readAnswer(`?${CALLBACK_PARAM}=${HEX}`), HEX);
  assert.equal(readAnswer(`?${CALLBACK_PARAM}=${NPUB}`), HEX);
});

test('anything else in the answer is ignored', () => {
  assert.equal(readAnswer(''), null);
  assert.equal(readAnswer('?other=1'), null);
  assert.equal(readAnswer(`?${CALLBACK_PARAM}=`), null);
  assert.equal(readAnswer(`?${CALLBACK_PARAM}=nsec1secret`), null, 'never a private key');
  assert.equal(readAnswer(`?${CALLBACK_PARAM}=npub1broken`), null);
  assert.equal(readAnswer(`?${CALLBACK_PARAM}=${HEX.toUpperCase()}`), null);
  assert.equal(readAnswer(`?${CALLBACK_PARAM}=${'a'.repeat(5000)}`), null);
});

test('only a plain hash route is restored after the trip', () => {
  assert.equal(safeReturn('#/people/follow'), '#/people/follow');
  assert.equal(safeReturn(null), '#/');
  assert.equal(safeReturn('https://evil.example'), '#/');
  assert.equal(safeReturn('#/x"><script>'), '#/');
});
