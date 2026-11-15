import { test } from 'node:test';
import assert from 'node:assert/strict';
import { npubEncode } from 'applesauce-core/helpers';
import { MAX_NAME, shortName } from './names.ts';

const PK = '3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d';

test('a set name is shown as is, trimmed', () => {
  assert.equal(shortName(PK, '  fiatjaf '), 'fiatjaf');
});

test('no name: the last 5 letters of the npub', () => {
  const npub = npubEncode(PK);
  assert.equal(shortName(PK), `…${npub.slice(-5)}`);
  assert.equal(shortName(PK, '   '), `…${npub.slice(-5)}`);
});

test('a key that is not valid hex still gets 5 letters', () => {
  assert.equal(shortName('not-a-key'), '…a-key');
});

test('a set name longer than MAX_NAME is clipped with an ellipsis', () => {
  const long = 'x'.repeat(MAX_NAME + 20);
  const shown = shortName(PK, long);
  assert.equal(shown.length, MAX_NAME);
  assert.ok(shown.endsWith('…'));
  assert.equal(shortName(PK, 'y'.repeat(MAX_NAME)), 'y'.repeat(MAX_NAME));
});
