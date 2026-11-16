import test from 'node:test';
import assert from 'node:assert/strict';
import { swSource } from './swSource.ts';

test('the generated worker names this build\'s cache and lists exactly its files', () => {
  const src = swSource('jukestr-abc123', ['/', '/index.html', '/assets/a.js'], 'function swRoute() { return "pass"; }');
  assert.match(src, /const CACHE = "jukestr-abc123";/);
  assert.match(src, /const FILES = \["\/","\/index.html","\/assets\/a.js"\];/);
  assert.match(src, /function swRoute\(\)/, 'the route rule is inlined');
  assert.ok(!/\/api\//.test(src.replace(/^.*swRoute.*$/m, '')), 'no special-casing of /api here: the route rule decides');
});

test('the generated worker parses as a script', () => {
  const src = swSource('jukestr-x', ['/'], 'function swRoute() { return "pass"; }');
  assert.doesNotThrow(() => new Function('self', 'caches', 'fetch', 'Response', src));
});

test('under a base path the kept page is that folder\'s index.html (feat-plebworld-deploy §D1)', () => {
  assert.match(swSource('jukestr-x', ['/jukestr/'], 'function swRoute() { return "pass"; }', '/jukestr/'), /cache\.put\("\/jukestr\/index\.html"/);
  assert.match(swSource('jukestr-x', ['/'], 'function swRoute() { return "pass"; }'), /caches\.match\("\/index\.html"\)/);
});
