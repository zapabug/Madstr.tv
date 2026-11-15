import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionSet, type SessionKV } from './sessionSet.ts';
import { hidePlayed } from './played.ts';
import type { MediaItem } from './media.ts';

const memory = (): SessionKV & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); } };
};

test('a session set survives a reload of the same tab (same storage)', () => {
  const kv = memory();
  const a = createSessionSet('k', 10, kv);
  a.add('x'); a.add('y');
  const b = createSessionSet('k', 10, kv);
  assert.ok(b.has('x') && b.has('y'));
  assert.equal(b.size, 2);
});

test('the oldest entries drop out past the cap', () => {
  const s = createSessionSet('k', 3, memory());
  for (const v of ['a', 'b', 'c', 'd']) s.add(v);
  assert.deepEqual([...s.snapshot()], ['b', 'c', 'd']);
});

test('removeAll clears a round; junk or blocked storage starts empty instead of failing', () => {
  const s = createSessionSet('k', 10, memory());
  s.add('a'); s.add('b'); s.add('c');
  s.removeAll(['a', 'c']);
  assert.deepEqual([...s.snapshot()], ['b']);
  const junk = memory(); junk.data.set('k', '{not json');
  assert.equal(createSessionSet('k', 10, junk).size, 0);
  const blocked: SessionKV = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  const m = createSessionSet('k', 10, blocked);
  m.add('a');
  assert.ok(m.has('a'), 'still works in memory');
  assert.equal(createSessionSet('k', 10, null).size, 0);
});

const item = (id: string): MediaItem => ({ id, kind: 'audio', origin: 'nostr', url: `https://cdn.example/${id}.mp3`, title: id, createdAt: 1 });

test('played items are left out when a list opens, except the ones to keep', () => {
  const list = ['a', 'b', 'c'].map(item);
  assert.deepEqual(hidePlayed(list, new Set(['b'])).items.map(i => i.id), ['a', 'c']);
  assert.deepEqual(hidePlayed(list, new Set(['a', 'b']), ['a']).items.map(i => i.id), ['a', 'c'], 'the item playing stays');
  assert.equal(hidePlayed(list, new Set()).items, list, 'nothing played: the same list');
});

test('"everything played" is told apart from "nothing here yet"', () => {
  assert.equal(hidePlayed(['a'].map(item), new Set(['a'])).allPlayed, true);
  assert.equal(hidePlayed([], new Set(['a'])).allPlayed, false);
});
