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

export interface RadioParts {
  live: readonly MediaItem[];
  stations: readonly MediaItem[]; // the sticker's stations (a genre, or Your stations)
  followed: readonly MediaItem[]; // stations posted by people you follow
  follows: ReadonlySet<string>;
  country?: string; // '' or undefined: every country
}

/** Radio's playlist (spec RA2, RA3b): Live now (follows first, then music / radio shows), then stations from people
 *  you follow, then the sticker's stations; stations filtered by country; each station once (by address, then url). */
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
  const live = [...parts.live].sort(newest);
  const inCountry = (s: MediaItem) => !parts.country || s.country === parts.country;
  return [
    ...live.filter(fromFollow),
    ...live.filter(i => !fromFollow(i) && isMusicShow(i)),
    ...[...parts.followed].filter(fromFollow).filter(inCountry).sort(newest),
    ...parts.stations.filter(inCountry),
  ].filter(once);
}

// --- what is kept on this device --------------------------------------------------------------------------

export interface RadioPrefs {
  genres: string[]; // your genre stickers, in your order
  country: string; // '' = every country
  sticker: string; // 'yours' or one of the genres
}
export const RADIO_PREFS_KEY = 'madstr:radio';
export const DEFAULT_PREFS: RadioPrefs = { genres: [], country: '', sticker: 'yours' };
const MAX_PICKED = 40;

export function parsePrefs(raw: unknown): RadioPrefs {
  if (!raw || typeof raw !== 'object') return DEFAULT_PREFS;
  const r = raw as Record<string, unknown>;
  const genres = Array.isArray(r.genres) ? [...new Set(r.genres.map(cleanGenre).filter(Boolean))].slice(0, MAX_PICKED) : [];
  const country = typeof r.country === 'string' && COUNTRY.test(r.country) ? r.country : '';
  const sticker = typeof r.sticker === 'string' && (r.sticker === 'yours' || genres.includes(r.sticker)) ? r.sticker : 'yours';
  return { genres, country, sticker };
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
