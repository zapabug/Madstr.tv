import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPreviews, SHOW, SHOW_PICTURES, type PreviewInput } from './previews.ts';
import type { MediaItem } from './media.ts';

const item = (id: string, over: Partial<MediaItem> = {}): MediaItem => ({
  id, kind: 'audio', origin: 'nostr', url: `https://cdn.example/${id}.mp3`, title: `Title ${id}`, createdAt: 1, ...over,
});
const video = (id: string, over: Partial<MediaItem> = {}): MediaItem => item(id, { kind: 'video', url: `https://cdn.example/${id}.mp4`, ...over });

const base = (over: Partial<PreviewInput> = {}): PreviewInput => ({
  music: [], podcasts: [], radio: [], localCount: 0, video: [], short: [], long: [], last: null, ownPictures: [], creators: [], ...over,
});

test('Music shows the cover of the next track itself, not a later one', () => {
  const p = buildPreviews(base({ music: [item('a'), item('b', { image: 'https://img/b.jpg' })] }));
  assert.deepEqual(p.music.urls, [], 'the next track has no cover, so the drawn fallback shows');
  assert.equal(p.music.text, 'Title a');
  const q = buildPreviews(base({ music: [item('a', { image: 'https://img/a.jpg' })] }));
  assert.deepEqual(q.music.urls, ['https://img/a.jpg']);
});

test('Podcasts show the cover of the next episode', () => {
  const p = buildPreviews(base({ podcasts: [item('ep1', { image: 'https://img/ep1.jpg' }), item('ep2', { image: 'https://img/ep2.jpg' })] }));
  assert.deepEqual(p.podcasts.urls, ['https://img/ep1.jpg']);
  assert.equal(p.podcasts.text, 'Title ep1');
});

test('Short and Long rotate through the posters of the next few videos only', () => {
  const short = Array.from({ length: SHOW + 3 }, (_, i) => video(`s${i}`, { image: `https://img/s${i}.jpg`, short: true }));
  const p = buildPreviews(base({ short, long: [video('l0'), video('l1', { image: 'https://img/l1.jpg' })] }));
  assert.deepEqual(p.short.urls, short.slice(0, SHOW).map(v => v.image));
  assert.equal(p.short.text, 'Title s0');
  assert.deepEqual(p.long.urls, ['https://img/l1.jpg']);
});

test('Long videos: posters come from further down when the next ones have none (kind 1 notes)', () => {
  const long = [...Array.from({ length: 10 }, (_, i) => video(`note${i}`)), video('k21', { image: 'https://img/k21.jpg' })];
  const p = buildPreviews(base({ long }));
  assert.deepEqual(p.long.urls, ['https://img/k21.jpg']);
  assert.equal(p.long.text, 'Title note0', 'the text still names the next video');
});

test('no preview ever asks for a video frame', () => {
  const p = buildPreviews(base({ short: [video('s0')], long: [video('l0')], video: [video('v0')] }));
  for (const data of Object.values(p)) assert.equal('frame' in data, false);
  assert.deepEqual(p.short.urls, []);
});

test('Keep watching: progress uses the length the player measured', () => {
  const last = { item: video('v', { image: 'https://img/v.jpg' }), position: 30, duration: 120 };
  const p = buildPreviews(base({ last }));
  assert.equal(p.continue.progress, 0.25);
  assert.deepEqual(p.continue.urls, ['https://img/v.jpg']);
});

test('Keep watching: falls back to the event length, else no bar; clamps to 0..1', () => {
  assert.equal(buildPreviews(base({ last: { item: video('v', { duration: 60 }), position: 30 } })).continue.progress, 0.5);
  assert.equal(buildPreviews(base({ last: { item: video('v'), position: 30 } })).continue.progress, undefined);
  assert.equal(buildPreviews(base({ last: { item: video('v'), position: 500, duration: 100 } })).continue.progress, 1);
});

test('Keep watching with no last video shows the newest videos', () => {
  const p = buildPreviews(base({ video: [video('n', { image: 'https://img/n.jpg' })] }));
  assert.deepEqual(p.continue.urls, ['https://img/n.jpg']);
  assert.equal(p.continue.progress, undefined);
});

test('My pictures shows only the device pictures, never Nostr ones', () => {
  const own = Array.from({ length: SHOW_PICTURES + 2 }, (_, i) => `blob:pic${i}`);
  const p = buildPreviews(base({ ownPictures: own }));
  assert.deepEqual(p.pictures.urls, own.slice(0, SHOW_PICTURES));
  assert.equal(p.pictures.text, `${own.length} of yours`);
  assert.deepEqual(buildPreviews(base()).pictures.urls, []);
  assert.equal(buildPreviews(base()).pictures.text, undefined, 'nothing invented when there are no pictures');
});

test('Local and Follow say what there is, or nothing', () => {
  const p = buildPreviews(base({ localCount: 3, creators: ['a', 'b', 'c', 'd', 'e'] }));
  assert.equal(p.local.text, '3 tracks');
  assert.deepEqual(p.follow.avatars, ['a', 'b', 'c', 'd'].slice(0, SHOW));
  assert.equal(p.follow.text, '5 to follow');
  assert.equal(buildPreviews(base()).local.text, undefined);
});
