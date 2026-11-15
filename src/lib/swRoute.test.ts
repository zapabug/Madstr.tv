import test from 'node:test';
import assert from 'node:assert/strict';
import { swRoute } from './swRoute.ts';

const O = 'https://madstr-tv.vercel.app';
const shell = new Set(['/index.html', '/assets/index-abc.js', '/fonts/figtree.woff2', '/manifest.webmanifest']);
const get = (path: string, mode = 'cors') => ({ url: path.startsWith('http') || path.startsWith('wss') ? path : O + path, method: 'GET', mode });

test('page loads go network-first with the kept index.html as the offline fallback', () => {
  assert.equal(swRoute(get('/', 'navigate'), O, shell), 'navigate');
  assert.equal(swRoute(get('/#/listen/music', 'navigate'), O, shell), 'navigate');
});

test('the app shell comes from the cache', () => {
  assert.equal(swRoute(get('/assets/index-abc.js'), O, shell), 'shell');
  assert.equal(swRoute(get('/fonts/figtree.woff2'), O, shell), 'shell');
});

test('the RSS proxy, relays, media and other sites are never touched', () => {
  assert.equal(swRoute(get('/api/rss?url=https%3A%2F%2Ffeed'), O, shell), 'pass');
  assert.equal(swRoute(get('/api/rss', 'navigate'), O, shell), 'pass');
  assert.equal(swRoute(get('wss://relay.primal.net/'), O, shell), 'pass');
  assert.equal(swRoute(get('https://blossom.primal.net/abc.mp4'), O, shell), 'pass');
  assert.equal(swRoute(get('https://image.nostr.build/x.jpg'), O, shell), 'pass');
  assert.equal(swRoute(get('/assets/not-in-this-build.js'), O, shell), 'pass', 'a file this build does not list');
  assert.equal(swRoute({ ...get('/assets/index-abc.js'), method: 'POST' }, O, shell), 'pass');
  assert.equal(swRoute({ url: 'not a url', method: 'GET', mode: 'cors' }, O, shell), 'pass');
});
