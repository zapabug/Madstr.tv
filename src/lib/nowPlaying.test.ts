import test from 'node:test';
import assert from 'node:assert/strict';
import type { MediaItem } from './media.ts';
import type { PlayerState } from './player.ts';
import {
  clipText, createNowPlayingBridge, DRIFT_S, FALLBACK_TITLE, IDLE_END_MS, nowPlayingFrom, PAUSED_KEEP_MS, TEXT_MAX,
  type NowPlaying,
} from './nowPlaying.ts';

const item = (over: Partial<MediaItem> = {}): MediaItem => ({
  id: 'a', kind: 'audio', origin: 'nostr', url: 'https://x/a.mp3', title: 'Song', createdAt: 1, ...over,
} as MediaItem);
const state = (over: Partial<PlayerState> = {}): PlayerState => ({
  queue: [item()], index: 0, label: 'Music', status: 'playing', position: 0, duration: 200, rate: 1, shuffle: false, error: null, ...over,
});

function rig() {
  let clock = 0;
  const shows: NowPlaying[] = [];
  let ends = 0;
  const timers = new Map<number, { fn: () => void; at: number }>();
  let id = 1;
  const bridge = createNowPlayingBridge({
    show: n => shows.push(n),
    end: () => { ends++; },
    setTimer: (fn, ms) => { const h = id++; timers.set(h, { fn, at: clock + ms }); return h; },
    clearTimer: h => { timers.delete(h as number); },
    now: () => clock,
  });
  const advance = (ms: number) => {
    clock += ms;
    for (const [h, t] of [...timers]) if (t.at <= clock) { timers.delete(h); t.fn(); }
  };
  return { bridge, shows, ends: () => ends, timers, advance };
}

test('clipText: plain, one line, clipped', () => {
  assert.equal(clipText('  a\n\tb\u202e '), 'a b');
  assert.equal(clipText(undefined), '');
  const long = clipText('x'.repeat(200));
  assert.equal(long.length, TEXT_MAX);
  assert.ok(long.endsWith('…'));
});

test('nowPlayingFrom: item text, playlist name as the second line, only http(s) pictures', () => {
  const n = nowPlayingFrom(state({ queue: [item({ image: 'javascript:alert(1)' })] }));
  assert.deepEqual(n && { t: n.title, s: n.subtitle, i: n.image }, { t: 'Song', s: 'Music', i: '' });
  const m = nowPlayingFrom(state({ queue: [item({ title: ' ', subtitle: 'Artist', image: 'https://x/c.jpg' })] }));
  assert.deepEqual(m && { t: m.title, s: m.subtitle, i: m.image }, { t: FALLBACK_TITLE, s: 'Artist', i: 'https://x/c.jpg' });
  assert.equal(nowPlayingFrom(state({ status: 'idle' })), null);
  assert.equal(nowPlayingFrom(state({ queue: [], index: -1 })), null);
  assert.equal(nowPlayingFrom(state({ duration: NaN, queue: [item({ duration: 90 })] }))?.duration, 90);
});

test('starts with playing, never with a paused queue', () => {
  const { bridge, shows } = rig();
  bridge.update(state({ status: 'paused' }));
  assert.equal(shows.length, 0);
  bridge.update(state({ status: 'loading' }));
  bridge.update(state({ status: 'playing' }));
  assert.deepEqual(shows.map(s => s.status), ['loading', 'playing']);
});

test('tells only what changed: no resend while the position runs as expected', () => {
  const { bridge, shows, advance } = rig();
  bridge.update(state({ position: 10 }));
  advance(5000);
  bridge.update(state({ position: 15 }));
  bridge.update(state({ position: 15.5 }));
  assert.equal(shows.length, 1);
  bridge.update(state({ position: 15 + DRIFT_S + 5 })); // a seek
  assert.equal(shows.length, 2);
  bridge.update(state({ position: 22, queue: [item({ title: 'Other' })] }));
  assert.equal(shows.at(-1)?.title, 'Other');
});

test('a paused player keeps the controls for 10 minutes, playing again resets that', () => {
  const { bridge, ends, advance } = rig();
  bridge.update(state());
  bridge.update(state({ status: 'paused' }));
  advance(PAUSED_KEEP_MS - 1000);
  bridge.update(state({ status: 'playing' }));
  bridge.update(state({ status: 'paused' }));
  advance(PAUSED_KEEP_MS - 1000);
  assert.equal(ends(), 0);
  advance(2000);
  assert.equal(ends(), 1);
  bridge.update(state({ status: 'paused' })); // still paused: no new controls
  advance(PAUSED_KEEP_MS * 2);
  assert.equal(ends(), 1);
});

test('an error keeps the controls like a pause', () => {
  const { bridge, ends, advance, shows } = rig();
  bridge.update(state());
  bridge.update(state({ status: 'error' }));
  assert.equal(shows.at(-1)?.status, 'error');
  advance(IDLE_END_MS * 10);
  assert.equal(ends(), 0);
});

test('an empty player ends them after 3 s, unless something plays first', () => {
  const { bridge, ends, advance } = rig();
  bridge.update(state());
  bridge.update(state({ status: 'idle' }));
  advance(IDLE_END_MS - 500);
  bridge.update(state());
  advance(IDLE_END_MS * 2);
  assert.equal(ends(), 0);
  bridge.update(state({ queue: [], index: -1, status: 'idle' }));
  advance(IDLE_END_MS);
  assert.equal(ends(), 1);
});

test('nothing to end when nothing was shown', () => {
  const { bridge, ends, timers } = rig();
  bridge.update(state({ status: 'idle' }));
  assert.equal(timers.size, 0);
  assert.equal(ends(), 0);
});
