import test from 'node:test';
import assert from 'node:assert/strict';
import { tvWidth } from './tvWidth.ts';

test('the TV page width is 1280 unless a test build asks for 1920', () => {
  assert.equal(tvWidth(undefined), 1280);
  assert.equal(tvWidth('1920'), 1920);
  assert.equal(tvWidth('1280'), 1280);
  for (const bad of ['', '960', '4000', 'wide', null, 1919]) assert.equal(tvWidth(bad), 1280, String(bad));
});
