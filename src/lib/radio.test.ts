import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { NostrEventLike } from './media.ts';
import {
  DEFAULT_PREFS, countryCounts, countryFromLanguage, genreCounts, isHls, isStation, liveFromEvent, parsePrefs, parseSaved,
  radioQueue, savedList, stationFromEvent,
} from './radio.ts';

// Real events from relay.wavefunc.live, relay.zap.stream and relay.primal.net (2026-11-16), as they came.
const load = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')) as NostrEventLike[];
const stations = load('station-events.json');
const lives = load('live-events.json');
const byName = (name: string) => stations.find(e => e.tags.some(t => t[0] === 'name' && t[1].startsWith(name)))!;
const byTitle = (title: string) => lives.find(e => e.tags.some(t => t[0] === 'title' && t[1].startsWith(title)))!;
const NOW = 1794867000; // a few minutes after the live events were fetched

test('a hand-made station: the stream from its stream tag and content, genres, logo', () => {
  const s = stationFromEvent(byName('Omarchy Radio'))!;
  assert.equal(s.url, 'https://radio.cliamp.stream/omarchy/stream');
  assert.equal(s.title, 'Omarchy Radio');
  assert.equal(s.image, 'https://radio.cliamp.stream/logo.svg');
  assert.deepEqual(s.genres, ['punk', 'rock']);
  assert.equal(s.live, true);
  assert.equal(s.address, '31237:06639a386c9c1014217622ccbcf40908c4f1a0c33e23f8d6d68f4abf655f8f71:285be424-743b-461c-a128-8b33319af2d0');
  assert.equal(s.country, undefined);
});

test('a station with `country` instead of `countryCode` and a location', () => {
  const s = stationFromEvent(byName('Good Morning Bitcoin'))!;
  assert.equal(s.country, 'US');
  assert.equal(s.subtitle, 'Lexington, KY');
  assert.equal(s.url, 'https://radio.goodmorningbitcoin.com/listen/goodmorningbitcoin/radio.mp3');
});

test("an importer's station: the stream from the content JSON, countryCode, many genres clipped to 12", () => {
  const s = stationFromEvent(byName('Mega FM'))!;
  assert.equal(s.country, 'MX');
  assert.equal(s.subtitle, 'MX');
  assert.ok(s.url.startsWith('https://'));
  assert.equal(s.genres!.length, 12);
  assert.ok(s.title.length <= 160);
});

test('a station with only http streams cannot play on the web and is left out', () => {
  assert.equal(stationFromEvent(byName('Australian Digital Radio Network')), null);
  assert.equal(stationFromEvent(byName('4YOU')), null); // two streams, both http
});

test('an HLS station is kept, and known as HLS', () => {
  const s = stationFromEvent(byName('Dance Hits'))!;
  assert.equal(s.url, 'https://wz2liw.scahw.com.au/live/2dance_128.stream/playlist.m3u8');
  assert.equal(isHls(s.url), true);
  assert.equal(isHls('https://radio.cliamp.stream/omarchy/stream'), false);
  assert.equal(isHls('https://a.test/x.m3u8?token=1'), true);
});

test('hostile station content: bad JSON, javascript links, other kinds', () => {
  const base = byName('Omarchy Radio');
  assert.equal(stationFromEvent({ ...base, content: 'not json', tags: base.tags.filter(t => t[0] !== 'stream') }), null);
  assert.equal(stationFromEvent({ ...base, content: '{"streams":[{"url":"javascript:alert(1)","primary":true}]}', tags: base.tags.filter(t => t[0] !== 'stream') }), null);
  assert.equal(stationFromEvent({ ...base, kind: 1 }), null);
  assert.equal(stationFromEvent({ ...base, tags: base.tags.filter(t => t[0] !== 'd') }), null);
  const s = stationFromEvent({ ...base, tags: [...base.tags.filter(t => t[0] !== 'name'), ['name', 'x'.repeat(500)], ['thumbnail', 'javascript:1']] })!;
  assert.equal(s.title.length, 160);
});

test('live shows: music and radio shows with an https stream, updated within the hour', () => {
  const lot = liveFromEvent(byTitle('The Lot Radio'), NOW)!;
  assert.equal(lot.url, 'https://livepeercdn.studio/hls/85c28sa2o8wppm58/index.m3u8');
  assert.equal(lot.title, 'The Lot Radio: Bliss Point with Evita');
  assert.ok(lot.image?.startsWith('https://'));
  assert.equal(lot.live, true);
  const nogood = liveFromEvent(byTitle('NoGood Radio'), NOW)!;
  assert.equal(nogood.url, 'https://api-uk.zap.stream/537a365c-f1ec-44ac-af10-22d14a7319fb/hls/live.m3u8'); // not the moq:// one
  assert.equal(nogood.pubkey, '55f04590674f3648f4cdc9dc8ce32da2a282074cd0b020596ee033d12d385185'); // the host, not the signer
  assert.equal(liveFromEvent(byTitle('Host test'), NOW), null); // no stream
  assert.equal(liveFromEvent(byTitle('The Road to ZamRock'), NOW), null); // ended
  assert.equal(liveFromEvent(byTitle('The Lot Radio'), NOW + 2 * 3600), null); // not updated for two hours
});

test("Radio's order: follows' live shows, music / radio shows, follows' stations, then the sticker's", () => {
  const live = lives.map(e => liveFromEvent(e, NOW)).filter(x => x !== null);
  const all = stations.map(stationFromEvent).filter(x => x !== null);
  const gaming = live.find(l => l.title.startsWith('New week'))!;
  const omarchy = all.find(s => s.title === 'Omarchy Radio')!;
  const gmb = all.find(s => s.title === 'Good Morning Bitcoin')!;
  const queue = radioQueue({ live, stations: all, followed: [gmb], follows: new Set([gaming.pubkey!, gmb.pubkey!]) });
  assert.deepEqual(queue.slice(0, 5).map(i => i.title), [
    'New week, new challenges... 🔞', // followed, so in although it is not music
    'The Lot Radio: Bliss Point with Evita', 'NoGood Radio', 'Noderunners Radio', // newest first
    'Good Morning Bitcoin',
  ]);
  assert.equal(queue.filter(i => i.title === 'Good Morning Bitcoin').length, 1);
  assert.ok(queue.includes(omarchy));
  // Without follows the gaming stream is not in; the country filter leaves the live shows alone.
  const mx = radioQueue({ live, stations: all, followed: [], follows: new Set(), country: 'MX' });
  assert.deepEqual(mx.map(i => i.title.slice(0, 12)), ['The Lot Radi', 'NoGood Radio', 'Noderunners ', 'Mega FM (Vil']);
});

test('genres commonest first without the dull words; countries; the device country', () => {
  const all = stations.map(stationFromEvent).filter(x => x !== null);
  const genres = genreCounts([...all, ...all.slice(0, 1)]);
  assert.equal(genres[0].genre, 'punk');
  assert.equal(genres[0].count, 2);
  assert.ok(!genres.some(g => ['music', 'fm', 'estación'].includes(g.genre)));
  assert.deepEqual(countryCounts(all), [{ country: 'AU', count: 1 }, { country: 'MX', count: 1 }, { country: 'US', count: 1 }]);
  assert.equal(countryFromLanguage('pt-PT'), 'PT');
  assert.equal(countryFromLanguage('en'), undefined);
  assert.equal(countryFromLanguage('zh-Hans-CN'), undefined); // a script, not a country, comes first
});

test('prefs and Your stations read back as untrusted', () => {
  assert.deepEqual(parsePrefs(null), DEFAULT_PREFS);
  assert.deepEqual(parsePrefs({ genres: ['Rock ', 'rock', 5, 'Jazz'], country: 'pt', sticker: 'jazz' }), { genres: ['rock', 'jazz'], country: '', sticker: 'jazz' });
  assert.equal(parsePrefs({ genres: ['rock'], sticker: 'opera' }).sticker, 'yours');
  const s = stationFromEvent(byName('Omarchy Radio'))!;
  const saved = parseSaved({
    [s.id]: { at: 2, item: s },
    'nostr:x': { at: 1, item: { ...s, id: 'nostr:x', url: 'http://plain.test/s' } }, // not https
    'nostr:y': { at: 3, item: { ...s, id: 'nostr:other' } }, // id does not match
    'nostr:z': { at: 'soon', item: { ...s, id: 'nostr:z' } },
  });
  assert.deepEqual(Object.keys(saved), [s.id]);
  assert.deepEqual(savedList(saved), [s]);
});

test('a station is what Your stations keeps; a live show is not', () => {
  assert.equal(isStation(stationFromEvent(byName('Omarchy Radio'))!), true);
  assert.equal(isStation(liveFromEvent(byTitle('The Lot Radio'), NOW)!), false);
  assert.equal(isStation({ address: undefined }), false);
});
