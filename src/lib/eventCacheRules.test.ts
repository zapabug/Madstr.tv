import test from 'node:test';
import assert from 'node:assert/strict';
import { cacheGroup, cacheKey, overCap, reviveCacheEntry, type CacheEntry, type StoredEvent } from './eventCacheRules.ts';

const A = 'a'.repeat(64);
const ev = (over: Partial<StoredEvent>): StoredEvent => ({ id: 'e'.repeat(64), pubkey: A, created_at: 100, kind: 1, tags: [], content: '', sig: 'f'.repeat(128), ...over });

test('cacheGroup: profiles, the owners\' follow lists, music and video posts; nothing else', () => {
  const owners = new Set([A]);
  assert.equal(cacheGroup(ev({ kind: 0 }), owners), 'profile');
  assert.equal(cacheGroup(ev({ kind: 3 }), owners), 'contacts');
  assert.equal(cacheGroup(ev({ kind: 3 }), new Set()), null);
  assert.equal(cacheGroup(ev({ content: 'new song https://x.org/a.mp3' }), owners), 'audio');
  assert.equal(cacheGroup(ev({ content: 'clip https://x.org/a.mp4' }), owners), 'video');
  assert.equal(cacheGroup(ev({ content: 'just words' }), owners), null);
  assert.equal(cacheGroup(ev({ content: 'pic https://x.org/a.jpg' }), owners), null);
});

test('cacheKey: one entry per person for profiles and follow lists, the id otherwise', () => {
  assert.equal(cacheKey(ev({ kind: 0 })), `0:${A}`);
  assert.equal(cacheKey(ev({ kind: 3 })), `3:${A}`);
  assert.equal(cacheKey(ev({})), 'e'.repeat(64));
});

test('reviveCacheEntry: only well-formed events, copied plain', () => {
  const good = { group: 'audio', seen: 5, event: { ...ev({}), extra: 'dropped' } };
  const back = reviveCacheEntry(good);
  assert.ok(back);
  assert.equal(back.key, 'e'.repeat(64));
  assert.equal('extra' in back.event, false);
  assert.equal(reviveCacheEntry({ ...good, group: 'nope' }), null);
  assert.equal(reviveCacheEntry({ ...good, event: { ...ev({}), sig: 'short' } }), null);
  assert.equal(reviveCacheEntry({ ...good, event: { ...ev({}), tags: [['t', 5]] } }), null);
  assert.equal(reviveCacheEntry({ ...good, event: { ...ev({}), pubkey: 'x' } }), null);
  assert.equal(reviveCacheEntry(null), null);
});

test('overCap: media keep the newest posts, profiles the most recently seen', () => {
  const entry = (key: string, group: CacheEntry['group'], created_at: number, seen: number): CacheEntry => ({ key, group, created_at, seen, event: ev({}) });
  const entries = [entry('a1', 'audio', 1, 9), entry('a2', 'audio', 3, 1), entry('a3', 'audio', 2, 5), entry('p1', 'profile', 9, 1), entry('p2', 'profile', 1, 9)];
  const drop = overCap(entries, { audio: 2, video: 1, profile: 1, contacts: 1, station: 1 });
  assert.deepEqual(drop.sort(), ['a1', 'p1']);
});

test('radio stations are kept, one entry per station address; http-only stations are not', async () => {
  const { readFileSync } = await import('node:fs');
  const stations = JSON.parse(readFileSync(new URL('./fixtures/station-events.json', import.meta.url), 'utf8')) as StoredEvent[];
  const omarchy = stations.find(e => e.tags.some(t => t[0] === 'name' && t[1] === 'Omarchy Radio'))!;
  const httpOnly = stations.find(e => e.tags.some(t => t[0] === 'name' && t[1].startsWith('Australian Digital')))!;
  assert.equal(cacheGroup(omarchy, new Set()), 'station');
  assert.equal(cacheKey(omarchy), '31237:06639a386c9c1014217622ccbcf40908c4f1a0c33e23f8d6d68f4abf655f8f71:285be424-743b-461c-a128-8b33319af2d0');
  assert.equal(cacheGroup(httpOnly, new Set()), null);
  assert.equal(reviveCacheEntry({ group: 'station', seen: 1, event: omarchy })?.group, 'station');
});
