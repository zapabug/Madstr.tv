import test from 'node:test';
import assert from 'node:assert/strict';

// loadLastVideo reads localStorage; Node has none, so give it a plain in-memory one.
const mem = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => { mem.set(k, v); },
  removeItem: (k: string) => { mem.delete(k); },
};
const { loadLastVideo } = await import('./player.ts');

const KEY = 'madstr:lastvideo';
const item = { id: 'v1', kind: 'video', origin: 'nostr', url: 'https://cdn.example/v1.mp4', title: 'A video', createdAt: 1, image: 'https://img/v1.jpg' };

test('the last video comes back with its position and measured length', () => {
  mem.set(KEY, JSON.stringify({ item, position: 42, duration: 300 }));
  const last = loadLastVideo();
  assert.equal(last?.position, 42);
  assert.equal(last?.duration, 300);
  assert.equal(last?.item.image, 'https://img/v1.jpg');
});

test('an older save without a length still restores', () => {
  mem.set(KEY, JSON.stringify({ item, position: 10 }));
  assert.equal(loadLastVideo()?.duration, undefined);
});

test('a stored poster that is not http(s) is dropped', () => {
  mem.set(KEY, JSON.stringify({ item: { ...item, image: 'javascript:alert(1)' }, position: 0 }));
  assert.equal(loadLastVideo()?.item.image, undefined);
});

test('junk or non-video saves give nothing', () => {
  mem.set(KEY, '{not json');
  assert.equal(loadLastVideo(), null);
  mem.set(KEY, JSON.stringify({ item: { ...item, kind: 'audio' }, position: 0 }));
  assert.equal(loadLastVideo(), null);
  mem.set(KEY, JSON.stringify({ item: { ...item, url: 'file:///etc/passwd' }, position: 0 }));
  assert.equal(loadLastVideo(), null);
  mem.set(KEY, JSON.stringify({ item, position: 5, duration: -3 }));
  assert.equal(loadLastVideo()?.duration, undefined);
});
