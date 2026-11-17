// Radio, Nostr first (spec feat-radio.md). Stations are kind 31237 events (WaveFunc), live shows are NIP-53 kind
// 30311 events (zap.stream and others). Everything in them is untrusted, as with every relay event: names clipped,
// only https streams (a web page on https cannot play http ones), and an event with nothing playable is left out.
// The rules below come from real events (probed 2026-11-16; fixtures in fixtures/station-events.json and
// fixtures/live-events.json):
//  - importer stations carry `countryCode`, `location`, `l` and the streams only in the content JSON;
//  - hand-made stations carry a `stream` tag (url, format, quality, "primary"), sometimes `country`;
//  - genres are `["c", <genre>, "genre"]`;
//  - live events: `status` live, a `streaming` url (HLS), `title`, `image`, `t` tags; some keep saying live for
//    days, so only those updated within the last hour count (NIP-53).
import { clip, hashtagsOf, isHttpUrl, tagValue, type MediaItem, type NostrEventLike } from './media.ts';

export const STATION_KIND = 31237;
export const LIVE_KIND = 30311;
export const RADIO_RELAY = 'wss://relay.wavefunc.live';
export const PAGE = 500; // the relay refuses a larger limit
export const LIVE_FRESH_SECONDS = 60 * 60;
export const START_TIMEOUT_MS = 10_000; // spec RA3: a station that does not start within 10 s
export const MAX_SAVED = 500;
export const MAX_GENRES_SHOWN = 200;

const MAX_GENRE = 40;
const MAX_GENRES_PER_STATION = 12;
const MAX_ID = 200;
const HEX64 = /^[0-9a-f]{64}$/;
const COUNTRY = /^[A-Z]{2}$/;

// Words that say nothing about what a station plays (spec RA2 Open; the list is in planning.md).
export const DULL_GENRES: ReadonlySet<string> = new Set([
  'music', 'música', 'musica', 'musique', 'musik', 'radio', 'fm', 'am', 'estación', 'estacion', 'station', 'emisora',
  'internet radio', 'online radio', 'web radio', 'webradio', 'radio station', 'live', 'stream', 'streaming',
]);

const isHttps = (url: unknown): url is string => typeof url === 'string' && url.startsWith('https://') && isHttpUrl(url);

export function isHls(url: string): boolean {
  try { return /\.m3u8$/i.test(new URL(url).pathname); } catch { return false; }
}

export function cleanGenre(raw: unknown): string {
  return typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().toLowerCase().slice(0, MAX_GENRE) : '';
}

interface Stream { url: string; primary: boolean }

function streamsOf(e: NostrEventLike): Stream[] {
  const out: Stream[] = [];
  try {
    const content: unknown = JSON.parse(e.content);
    const list = content && typeof content === 'object' ? (content as { streams?: unknown }).streams : undefined;
    if (Array.isArray(list)) {
      for (const s of list.slice(0, 20)) {
        if (s && typeof s === 'object' && typeof (s as { url?: unknown }).url === 'string') {
          out.push({ url: (s as { url: string }).url, primary: (s as { primary?: unknown }).primary === true });
        }
      }
    }
  } catch { /* content that is not JSON: the tags may still have the stream */ }
  for (const t of e.tags) if (t[0] === 'stream' && t[1]) out.push({ url: t[1], primary: t.slice(2).includes('primary') });
  return out;
}

/** The stream to play: the primary https one, else the first https one, else none. */
export function pickStream(e: NostrEventLike): string | undefined {
  const https = streamsOf(e).filter(s => isHttps(s.url));
  return (https.find(s => s.primary) ?? https[0])?.url;
}

export function stationFromEvent(e: NostrEventLike): MediaItem | null {
  if (e.kind !== STATION_KIND || !HEX64.test(e.pubkey)) return null;
  const d = tagValue(e.tags, 'd');
  const url = pickStream(e);
  if (!d || !url) return null;
  const genres = [...new Set(e.tags.filter(t => t[0] === 'c' && (t[2] === undefined || t[2] === 'genre')).map(t => cleanGenre(t[1])).filter(Boolean))]
    .slice(0, MAX_GENRES_PER_STATION);
  const code = (tagValue(e.tags, 'countryCode') ?? tagValue(e.tags, 'country') ?? '').trim().toUpperCase();
  const country = COUNTRY.test(code) ? code : undefined;
  const location = clip(tagValue(e.tags, 'location'));
  const image = tagValue(e.tags, 'thumbnail') ?? tagValue(e.tags, 'image');
  return {
    id: `nostr:${e.id}`,
    kind: 'audio',
    origin: 'nostr',
    live: true,
    url,
    title: clip(tagValue(e.tags, 'name')) || 'Radio station',
    subtitle: location && location !== country ? location : country,
    image: isHttpUrl(image) ? image : undefined,
    pubkey: e.pubkey,
    createdAt: e.created_at,
    address: `${STATION_KIND}:${e.pubkey}:${d.slice(0, MAX_ID)}`,
    genres,
    country,
  };
}

/** A live show that can play now, or null (ended, stale, or no https stream). `now` in seconds. */
export function liveFromEvent(e: NostrEventLike, now: number): MediaItem | null {
  if (e.kind !== LIVE_KIND || !HEX64.test(e.pubkey)) return null;
  if (tagValue(e.tags, 'status') !== 'live' || now - e.created_at > LIVE_FRESH_SECONDS) return null;
  const d = tagValue(e.tags, 'd');
  // Some carry more than one `streaming` (an HLS url and a moq:// one): the first https one.
  const url = e.tags.find(t => t[0] === 'streaming' && isHttps(t[1]))?.[1];
  if (!d || !url) return null;
  // The host is who it is by (zap.stream and others may sign for them); the signer when no host is named.
  const host = e.tags.find(t => t[0] === 'p' && HEX64.test(t[1] ?? '') && (t[3] ?? '').toLowerCase() === 'host')?.[1];
  const image = tagValue(e.tags, 'image');
  return {
    id: `nostr:${e.id}`,
    kind: 'audio',
    origin: 'nostr',
    live: true,
    url,
    title: clip(tagValue(e.tags, 'title')) || 'Live show',
    subtitle: 'Live now',
    image: isHttpUrl(image) ? image : undefined,
    pubkey: host ?? e.pubkey,
    createdAt: e.created_at,
    address: `${LIVE_KIND}:${e.pubkey}:${d.slice(0, MAX_ID)}`,
    hashtags: hashtagsOf(e.tags),
  };
}

/** A radio station (kind 31237), not a live show: what Your stations keeps (feat-radio §RA4). */
export function isStation(item: Pick<MediaItem, 'address'>): boolean {
  return item.address?.startsWith(`${STATION_KIND}:`) ?? false;
}

/** Tagged music or radio (zap.stream also writes `internal:music`). */
export function isMusicShow(item: MediaItem): boolean {
  return (item.hashtags ?? []).some(t => /^(internal:)?(music|radio)$/.test(t));
}

/** The genres the stations carry, commonest first (ties by name), without the words that say nothing. */
export function genreCounts(stations: readonly MediaItem[], max = MAX_GENRES_SHOWN): Array<{ genre: string; count: number }> {
  const counts = new Map<string, number>();
  for (const s of stations) for (const g of s.genres ?? []) if (!DULL_GENRES.has(g)) counts.set(g, (counts.get(g) ?? 0) + 1);
  return [...counts].map(([genre, count]) => ({ genre, count }))
    .sort((a, b) => b.count - a.count || a.genre.localeCompare(b.genre)).slice(0, max);
}

/** The countries the stations are in, commonest first. */
export function countryCounts(stations: readonly MediaItem[]): Array<{ country: string; count: number }> {
  const counts = new Map<string, number>();
  for (const s of stations) if (s.country) counts.set(s.country, (counts.get(s.country) ?? 0) + 1);
  return [...counts].map(([country, count]) => ({ country, count })).sort((a, b) => b.count - a.count || a.country.localeCompare(b.country));
}

/** The device's country from its language setting ("pt-PT" → "PT"), if it names one. */
export function countryFromLanguage(lang: string | undefined): string | undefined {
  const region = (lang ?? '').split(/[-_]/)[1]?.toUpperCase();
  return region && COUNTRY.test(region) ? region : undefined;
}

export const MAX_LOADED = 300; // feat-radio §RA5: one selection loads at most 300 stations
export const PAGE_SHOWN = 30; // and plays them 30 at a time
const MIN_PER_WORD = 30;

/** How many stations each word asks for, so a selection stays under 300 (at least 30 each). */
export function perWord(words: number): number {
  return words <= 0 ? 0 : Math.max(MIN_PER_WORD, Math.floor(MAX_LOADED / words));
}

/** Each word's stations in turn (its genre answers, then its search answers), so every word that is on shows up
 *  near the top, not only the one with the most stations. */
export function takeTurns(perWordLists: readonly (readonly MediaItem[])[]): MediaItem[] {
  const out: MediaItem[] = [];
  const longest = Math.max(0, ...perWordLists.map(l => l.length));
  for (let k = 0; k < longest; k++) for (const list of perWordLists) if (k < list.length) out.push(list[k]);
  return out;
}

/** A live show belongs to a selection when it is tagged with one of its words (or its title says it); with All
 *  genres, when it is a music or radio show. */
export function liveMatches(item: MediaItem, words: readonly string[], allGenres: boolean): boolean {
  if (allGenres) return isMusicShow(item);
  const tags = new Set((item.hashtags ?? []).map(t => t.replace(/^internal:/, '')));
  const title = item.title.toLowerCase();
  return words.some(w => tags.has(w) || (w.length >= 3 && title.includes(w)));
}

export interface RadioParts {
  live: readonly MediaItem[]; // live shows that match the selection
  stations: readonly MediaItem[]; // the selection's stations, in the order they came
  follows: ReadonlySet<string>;
  countries: readonly string[]; // [] = every country
}

/** Radio's list (spec RA5): the matching live shows (follows' first, newest first), then the stations, those from
 *  people you follow first, filtered by country; each station once (by address, then url); at most 300 stations. */
export function radioQueue(parts: RadioParts): MediaItem[] {
  const seen = new Set<string>();
  const once = (item: MediaItem) => {
    const keys = [item.address ?? item.id, item.url];
    if (keys.some(k => seen.has(k))) return false;
    keys.forEach(k => seen.add(k));
    return true;
  };
  const newest = (a: MediaItem, b: MediaItem) => b.createdAt - a.createdAt || a.id.localeCompare(b.id);
  const fromFollow = (i: MediaItem) => i.pubkey !== undefined && parts.follows.has(i.pubkey);
  const live = [...parts.live].sort(newest).filter(once);
  const countries = new Set(parts.countries);
  const inCountry = (s: MediaItem) => countries.size === 0 || (s.country !== undefined && countries.has(s.country));
  const stations = parts.stations.filter(inCountry).filter(once).slice(0, MAX_LOADED);
  return [
    ...live.filter(fromFollow), ...live.filter(i => !fromFollow(i)),
    ...stations.filter(fromFollow), ...stations.filter(i => !fromFollow(i)),
  ];
}

/** The playlist shows `pages` pages of 30; the next page joins when the last shown item plays. */
export function shownCount(total: number, pages: number): number {
  return Math.min(total, Math.max(1, pages) * PAGE_SHOWN);
}

// --- what is kept on this device --------------------------------------------------------------------------

export interface RadioPrefs {
  genres: string[]; // your genre stickers (words), in your order
  on: string[]; // the ones selected (one or many)
  allGenres: boolean;
  yours: boolean; // Your stations selected
  countries: string[]; // your country stickers
  countriesOn: string[]; // the ones selected; none = every country
}
export const RADIO_PREFS_KEY = 'madstr:radio';
// Nothing selected: Radio starts empty until you pick (spec RA5).
export const DEFAULT_PREFS: RadioPrefs = { genres: [], on: [], allGenres: false, yours: false, countries: [], countriesOn: [] };
const MAX_PICKED = 40;

const cleanCountry = (v: unknown) => (typeof v === 'string' && COUNTRY.test(v) ? v : '');
const uniq = (list: unknown, clean: (_v: unknown) => string, max: number) =>
  Array.isArray(list) ? [...new Set(list.map(clean).filter(Boolean))].slice(0, max) : [];

export function parsePrefs(raw: unknown): RadioPrefs {
  if (!raw || typeof raw !== 'object') return DEFAULT_PREFS;
  const r = raw as Record<string, unknown>;
  const genres = uniq(r.genres, cleanGenre, MAX_PICKED);
  // The RA2 shape had one `country`; it becomes a country sticker that is on.
  const oldCountry = cleanCountry(r.country);
  const countries = uniq([...(Array.isArray(r.countries) ? r.countries : []), oldCountry], cleanCountry, MAX_PICKED);
  const countriesOn = uniq([...(Array.isArray(r.countriesOn) ? r.countriesOn : []), oldCountry], cleanCountry, MAX_PICKED).filter(c => countries.includes(c));
  const allGenres = r.allGenres === true;
  return {
    genres,
    on: allGenres ? [] : uniq(r.on, cleanGenre, MAX_PICKED).filter(g => genres.includes(g)),
    allGenres,
    yours: r.yours === true,
    countries,
    countriesOn,
  };
}

/** Whether anything is selected: without it Radio plays nothing (spec RA5). */
export function hasSelection(p: RadioPrefs): boolean {
  return p.allGenres || p.yours || p.on.length > 0;
}

export interface SavedStation {
  at: number;
  item: MediaItem;
}
export const SAVED_KEY = 'madstr:stations';

// Your stations, read back as untrusted: only what a station item has, checked again.
export function parseSaved(raw: unknown): Record<string, SavedStation> {
  const out: Record<string, SavedStation> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!id || id.length > MAX_ID || !v || typeof v !== 'object') continue;
    const at = (v as { at?: unknown }).at;
    const it = (v as { item?: unknown }).item as Record<string, unknown> | undefined;
    if (typeof at !== 'number' || !Number.isFinite(at) || !it || typeof it !== 'object' || it.id !== id || !isHttps(it.url)) continue;
    const country = typeof it.country === 'string' && COUNTRY.test(it.country) ? it.country : undefined;
    out[id] = {
      at,
      item: {
        id, kind: 'audio', origin: 'nostr', live: true, url: it.url,
        title: clip(typeof it.title === 'string' ? it.title : '') || 'Radio station',
        subtitle: clip(typeof it.subtitle === 'string' ? it.subtitle : '') || undefined,
        image: typeof it.image === 'string' && isHttpUrl(it.image) ? it.image : undefined,
        pubkey: typeof it.pubkey === 'string' && HEX64.test(it.pubkey) ? it.pubkey : undefined,
        createdAt: typeof it.createdAt === 'number' && Number.isFinite(it.createdAt) ? it.createdAt : 0,
        address: typeof it.address === 'string' && it.address.length <= MAX_ID ? it.address : undefined,
        genres: Array.isArray(it.genres) ? it.genres.map(cleanGenre).filter(Boolean).slice(0, MAX_GENRES_PER_STATION) : [],
        country,
      },
    };
  }
  return newestSaved(out);
}

export function newestSaved(saved: Record<string, SavedStation>, max = MAX_SAVED): Record<string, SavedStation> {
  const entries = Object.entries(saved);
  if (entries.length <= max) return saved;
  return Object.fromEntries(entries.sort((a, b) => b[1].at - a[1].at).slice(0, max));
}

/** Your stations, the newest saved first. */
export function savedList(saved: Record<string, SavedStation>): MediaItem[] {
  return Object.values(saved).sort((a, b) => b.at - a.at).map(s => s.item);
}
