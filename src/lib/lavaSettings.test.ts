import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_LAVA, parseLava, serializeLava } from './lavaSettings.ts';

test('nothing stored gives the default', () => {
  assert.deepEqual(parseLava(null), DEFAULT_LAVA);
  assert.deepEqual(parseLava(''), DEFAULT_LAVA);
});

test('a saved choice is kept', () => {
  assert.deepEqual(parseLava('{"on":false,"style":"focused"}'), { on: false, style: 'focused' });
  assert.deepEqual(parseLava('{"on":true,"style":"smoky"}'), { on: true, style: 'smoky' });
});

test('broken or hostile storage falls back field by field', () => {
  assert.deepEqual(parseLava('not json'), DEFAULT_LAVA);
  assert.deepEqual(parseLava('[]'), DEFAULT_LAVA);
  assert.deepEqual(parseLava('{"on":"yes","style":"rainbow"}'), DEFAULT_LAVA);
  assert.deepEqual(parseLava('{"on":false}'), { on: false, style: 'smoky' });
  assert.deepEqual(parseLava('{"style":"focused"}'), { on: true, style: 'focused' });
});

test('a saved choice round trips', () => {
  assert.deepEqual(parseLava(serializeLava({ on: false, style: 'focused' })), { on: false, style: 'focused' });
});
