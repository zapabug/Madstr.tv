import test from 'node:test';
import assert from 'node:assert/strict';
import { swSource } from './swSource.ts';

test('the generated worker names this build\'s cache and lists exactly its files', () => {
  const src = swSource('madstr-abc123', ['/', '/index.html', '/assets/a.js'], 'function swRoute() { return "pass"; }');
  assert.match(src, /const CACHE = "madstr-abc123";/);
  assert.match(src, /const FILES = \["\/","\/index.html","\/assets\/a.js"\];/);
  assert.match(src, /function swRoute\(\)/, 'the route rule is inlined');
  assert.ok(!/\/api\//.test(src.replace(/^.*swRoute.*$/m, '')), 'no special-casing of /api here: the route rule decides');
});

test('the generated worker parses as a script', () => {
  const src = swSource('madstr-x', ['/'], 'function swRoute() { return "pass"; }');
  assert.doesNotThrow(() => new Function('self', 'caches', 'fetch', 'Response', src));
});
