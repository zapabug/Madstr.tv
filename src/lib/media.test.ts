import test from 'node:test';
import assert from 'node:assert/strict';
import { audioFromEvent, videoFromEvent, imageFromEvent, parseDuration, isPodcast, imetaEntries, dedupeByUrl, sortNewest, stripNostrRefs, clip, type NostrEventLike, type MediaItem } from './media.ts';

const ev = (kind: number, tags: string[][], content = '', id = 'e'.repeat(8)): NostrEventLike =>
  ({ id, pubkey: 'p'.repeat(8), kind, created_at: 1000, tags, content });

// --- fixtures shaped like real events seen on relays ---------------------------------
const track31337 = ev(31337, [['d', 'nova-track-100'], ['title', 'Too Soon'], ['artist', 'NOVA'], ['url', 'https://example.com/too-soon.mp3'], ['image', 'https://example.com/cover.jpg'], ['duration', '170109']]);
const adSkip31337 = ev(31337, [['d', 'e005'], ['t', 'antennapod-adskip']], '{"status":"complete"}');
const encrypted31338 = ev(31337, [['d', 'x'], ['url', 'https://api.fanfares.live/cdn/abc'], ['encrypted', 'aes-256-gcm', '', 'https://api.fanfares.live/request-key']]);
const audio1063 = ev(1063, [['url', 'https://files.example/good-times'], ['m', 'audio/mpeg'], ['duration', '486'], ['title', 'Chic - Good Times']]);
const soundtrack1063 = ev(1063, [['url', 'https://media.divine.video/aaa'], ['m', 'audio/wav'], ['duration', '6.1'], ['a', '34236:4ee84e91:x']]);
const short34236 = ev(34236, [['d', 'z'], ['imeta', 'url https://media.divine.video/9132', 'm video/mp4', 'image https://media.divine.video/9132.jpg'], ['title', 'Scarecrows'], ['duration', '6']]);
const short22 = ev(22, [['title', 'Man'], ['imeta', 'url https://blossom.primal.net/738d52', 'm video/mp4'], ['duration', '28.07']]);
const long21 = ev(21, [['title', 'Sodor'], ['imeta', 'url https://example.com/sodor.mp4', 'm video/mp4'], ['duration', '7200']]);
const youtube21 = ev(21, [['title', 'YT'], ['imeta', 'url https://www.youtube.com/watch?v=iW4mygsymMM'], ['r', 'https://www.youtube.com/watch?v=iW4mygsymMM']]);
const long34235 = ev(34235, [['d', 'q'], ['title', 'Piano'], ['imeta', 'url https://blossom.ditto.pub/3d0e8f', 'dim 1920x1080'], ['duration', '3773']]);

test('a kind 31337 track with a url becomes audio; duration is milliseconds', () => {
  const item = audioFromEvent(track31337);
  assert.ok(item);
  assert.equal(item.title, 'Too Soon');
  assert.equal(item.subtitle, 'NOVA');
  assert.equal(item.url, 'https://example.com/too-soon.mp3');
  assert.equal(item.image, 'https://example.com/cover.jpg');
  assert.ok(Math.abs((item.duration ?? 0) - 170.109) < 0.001);
});

test('audio events that cannot be played are dropped', () => {
  assert.equal(audioFromEvent(adSkip31337), null, 'no url');
  assert.equal(audioFromEvent(encrypted31338), null, 'encrypted');
  assert.equal(audioFromEvent(soundtrack1063), null, 'a short video\'s soundtrack');
  assert.equal(audioFromEvent(ev(1, [], 'just words')), null);
  assert.equal(audioFromEvent(ev(1063, [['url', 'ftp://x/a.mp3'], ['m', 'audio/mpeg']])), null, 'not http(s)');
  assert.equal(audioFromEvent(ev(1063, [['url', 'https://x/a.png'], ['m', 'image/png']])), null, 'not audio');
});

test('kind 1063 audio keeps its seconds and a kind 1 note can link a file', () => {
  const a = audioFromEvent(audio1063);
  assert.equal(a?.duration, 486);
  assert.equal(a?.title, 'Chic - Good Times');
  const note = audioFromEvent(ev(1, [], 'Listen to this\nhttps://cdn.example.com/song.mp3?x=1'));
  assert.equal(note?.url, 'https://cdn.example.com/song.mp3?x=1');
  assert.equal(note?.title, 'Listen to this');
});

test('short and long videos follow the NIP-71 kinds', () => {
  assert.equal(videoFromEvent(short34236)?.short, true);
  assert.equal(videoFromEvent(short22)?.short, true);
  assert.equal(videoFromEvent(long21)?.short, false);
  assert.equal(videoFromEvent(long34235)?.short, false);
  assert.equal(videoFromEvent(short34236)?.image, 'https://media.divine.video/9132.jpg');
  assert.equal(videoFromEvent(short34236)?.url, 'https://media.divine.video/9132');
});

test('YouTube-only and url-less videos are dropped', () => {
  assert.equal(videoFromEvent(youtube21), null);
  assert.equal(videoFromEvent(ev(22, [['title', 'no media']])), null);
});

test('a 1063 video under a minute counts as short', () => {
  const clip = ev(1063, [['url', 'https://x/v.mp4'], ['m', 'video/mp4'], ['duration', '12']]);
  assert.equal(videoFromEvent(clip)?.short, true);
  const movie = ev(1063, [['url', 'https://x/v.mp4'], ['m', 'video/mp4'], ['duration', '900']]);
  assert.equal(videoFromEvent(movie)?.short, false);
});

test('pictures come from kind 20 imeta, 1063 images and linked images', () => {
  assert.equal(imageFromEvent(ev(20, [['imeta', 'url https://x/p.jpg', 'm image/jpeg'], ['title', 'Sunset']]))?.url, 'https://x/p.jpg');
  assert.equal(imageFromEvent(ev(1063, [['url', 'https://x/p'], ['m', 'image/png']]))?.url, 'https://x/p');
  assert.equal(imageFromEvent(ev(1, [], 'look https://x/p.webp'))?.url, 'https://x/p.webp');
  assert.equal(imageFromEvent(ev(1, [], 'no picture here')), null);
});

test('music vs podcast by origin and length', () => {
  const base: MediaItem = { id: 'a', kind: 'audio', origin: 'nostr', url: 'u', title: 't', createdAt: 1 };
  assert.equal(isPodcast({ ...base, duration: 200 }), false);
  assert.equal(isPodcast({ ...base, duration: 360 }), true);
  assert.equal(isPodcast({ ...base }), false, 'unknown length is music');
  assert.equal(isPodcast({ ...base, origin: 'rss', duration: 30 }), true);
  assert.equal(isPodcast({ ...base, origin: 'local', duration: 4000 }), false);
});

test('durations: seconds, mm:ss, hh:mm:ss, junk', () => {
  assert.equal(parseDuration('90'), 90);
  assert.equal(parseDuration('3:05'), 185);
  assert.equal(parseDuration('1:02:03'), 3723);
  assert.equal(parseDuration('00:50:50'), 3050);
  assert.equal(parseDuration('abc'), undefined);
  assert.equal(parseDuration(''), undefined);
  assert.equal(parseDuration('0'), undefined);
  assert.equal(parseDuration('170109', 31337) !== 170109, true);
  assert.equal(parseDuration('170109', 1063), 170109);
});

test('imeta tags parse into key/value entries, first key wins', () => {
  assert.deepEqual(imetaEntries([['imeta', 'url https://a', 'm video/mp4', 'url https://b']]), [{ url: 'https://a', m: 'video/mp4' }]);
  assert.deepEqual(imetaEntries([['t', 'x']]), []);
});

test('dedupe by url keeps the first; newest sorts first', () => {
  const mk = (id: string, url: string, createdAt: number): MediaItem => ({ id, kind: 'audio', origin: 'nostr', url, title: id, createdAt });
  const out = dedupeByUrl([mk('a', 'u1', 1), mk('b', 'u1', 2), mk('c', 'u2', 3)]);
  assert.deepEqual(out.map(i => i.id), ['a', 'c']);
  assert.deepEqual(sortNewest(out).map(i => i.id), ['c', 'a']);
});

const NPUB = 'npub1dergggklka99wwrs92yz8wdjs952h2ux2ha2ed598ngwu9w7a6fsh9xzpc';

test('nostr references are taken out of titles, with the dash before them', () => {
  assert.equal(stripNostrRefs(`\u201cDaily active users would be a terrible metric.\u201d - nostr:${NPUB}`), '\u201cDaily active users would be a terrible metric.\u201d');
  assert.equal(stripNostrRefs(`Great clip nostr:${NPUB}`), 'Great clip');
  assert.equal(stripNostrRefs(`${NPUB}`), '');
  assert.equal(stripNostrRefs('by nostr:nprofile1qqsrhuxx8l9ex335q7he0f09aej04zpazpl0ne2cgukyawd24mayt8gpp4mhxue69uhhytnc9e3k7mgpz4mhxue69uhkg6nzv9ejuumpv34kytnrdaksjlyr9p'), 'by');
  assert.equal(stripNostrRefs('Plain title - with a dash inside'), 'Plain title - with a dash inside');
  assert.equal(stripNostrRefs('npub is a word here'), 'npub is a word here', 'a bare word is not a reference');
});

test('a kind 1 note with a trailing reference gets a clean title', () => {
  const note = audioFromEvent(ev(1, [], `Nice track\nhttps://cdn.example.com/a.mp3\n- nostr:${NPUB}`));
  assert.equal(note?.title, 'Nice track');
  assert.equal(clip(`Title - nostr:${NPUB}`), 'Title');
});
