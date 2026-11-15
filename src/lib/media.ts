// Turning Nostr events (and RSS items, local files) into playable items. Everything
// in an event is untrusted: only http(s) URLs are kept, strings are clipped, and an
// event with no playable URL is dropped instead of guessed at.
//
// The rules below come from real events on relays (checked 2026-11-15):
//  - video: NIP-71 kinds 21 / 34235 are normal videos, 22 / 34236 are short videos; the playable
//    URL lives in an `imeta` tag, and some are only YouTube links. By zapa's rule a short video is
//    one under 30 seconds, so a known length decides and the kinds only matter without one.
//  - audio: in practice most music and podcasts are plain kind 1 notes: a link to an audio file
//    in the text, or an `imeta` attachment whose `m` is `audio/*` (uploads often have no file
//    extension). The dedicated kinds are rare but still read: kind 1063 with `m audio/*` (skip
//    the soundtracks of short videos, tagged `a 3423x:`) and kind 31337 tracks that carry a
//    `url` tag (their `duration` is in milliseconds). Encrypted audio (`encrypted` tag) cannot
//    be played and is skipped.

export interface NostrEventLike {
  id: string;
  pubkey: string;
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
}

export type MediaKind = 'audio' | 'video' | 'image';
export type Origin = 'nostr' | 'rss' | 'local';

export interface MediaItem {
  id: string;
  kind: MediaKind;
  origin: Origin;
  url: string;
  title: string;
  subtitle?: string;
  image?: string; // cover art / poster
  duration?: number; // seconds
  pubkey?: string;
  createdAt: number;
  short?: boolean; // videos only
  hashtags?: string[]; // the post's #tags, lower case
}

export const AUDIO_KINDS = [1, 1063, 31337];
export const VIDEO_KINDS = [1, 21, 22, 34235, 34236, 1063];
export const IMAGE_KINDS = [1, 20, 1063];

export const MUSIC_MAX_SECONDS = 9 * 60; // zapa's rule: longer than 9 minutes is a podcast
export const SHORT_VIDEO_SECONDS = 30; // zapa's rule: a short video is under 30 seconds

const MAX_TEXT = 160;
const AUDIO_URL = /https?:\/\/[^\s"'<>]+?\.(?:mp3|m4a|ogg|oga|opus|aac|wav|flac)(?:\?[^\s"'<>]*)?/i;
const VIDEO_URL = /https?:\/\/[^\s"'<>]+?\.(?:mp4|mov|webm|m3u8)(?:\?[^\s"'<>]*)?/i;
const IMAGE_URL = /https?:\/\/[^\s"'<>]+?\.(?:png|jpe?g|gif|webp|avif)(?:\?[^\s"'<>]*)?/i;
const ANY_URL = /https?:\/\/[^\s"'<>]+/gi;

// Notes often end with a Nostr reference ("... - nostr:npub1...") that is noise in a title.
const NOSTR_REF = /(?:nostr:)?(?:npub|nprofile|note|nevent|naddr)1[023456789acdefghjklmnpqrstuvwxyz]{20,}/gi;
const TRAILING_SEPARATORS = /[\s\-\u2013\u2014:,|\u00b7]+$/;

// Take Nostr references out of a title, and the dash or colon that led up to them.
export function stripNostrRefs(text: string): string {
  return text.replace(NOSTR_REF, '').replace(/\s+/g, ' ').replace(TRAILING_SEPARATORS, '').trim();
}

export function clip(text: string | undefined | null): string {
  return stripNostrRefs(text ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
}

export function isHttpUrl(value: string | undefined | null): value is string {
  if (!value) return false;
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function isYouTube(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return host === 'youtube.com' || host === 'youtu.be' || host.endsWith('.youtube.com');
  } catch {
    return false;
  }
}

export function tagValue(tags: string[][], name: string): string | undefined {
  return tags.find(t => t[0] === name && t[1] !== undefined)?.[1];
}

// ["imeta", "url https://…", "m video/mp4", "image https://…"]  ->  { url, m, image }
export function imetaEntries(tags: string[][]): Record<string, string>[] {
  return tags
    .filter(t => t[0] === 'imeta')
    .map(t => {
      const out: Record<string, string> = {};
      for (const part of t.slice(1)) {
        const space = part.indexOf(' ');
        if (space < 1) continue;
        const key = part.slice(0, space);
        if (!(key in out)) out[key] = part.slice(space + 1).trim();
      }
      return out;
    });
}

// Seconds. Kind 31337 tracks write milliseconds ("170109" is 2:50).
export function parseDuration(raw: string | undefined, kind?: number): number | undefined {
  if (!raw) return undefined;
  let seconds: number;
  if (raw.includes(':')) {
    const parts = raw.split(':').map(Number);
    if (parts.some(Number.isNaN) || parts.length > 3) return undefined;
    seconds = parts.reduce((total, p) => total * 60 + p, 0);
  } else {
    seconds = Number(raw);
    if (!Number.isFinite(seconds)) return undefined;
    if (kind === 31337 && seconds > 10000) seconds /= 1000;
  }
  return seconds > 0 ? seconds : undefined;
}

function nameFromUrl(url: string): string {
  try {
    const last = new URL(url).pathname.split('/').filter(Boolean).pop() ?? '';
    return clip(decodeURIComponent(last).replace(/\.[A-Za-z0-9]{2,4}$/, ''));
  } catch {
    return '';
  }
}

function firstLine(content: string): string {
  return clip(content.replace(ANY_URL, '').split('\n').find(l => l.trim()) ?? '');
}

function httpOrUndefined(value: string | undefined): string | undefined {
  return isHttpUrl(value) ? value : undefined;
}

export function hashtagsOf(tags: string[][]): string[] {
  return [...new Set(tags.filter(t => t[0] === 't' && t[1]).map(t => t[1].toLowerCase().slice(0, 30)))].slice(0, 8);
}

export function audioFromEvent(e: NostrEventLike): MediaItem | null {
  if (!AUDIO_KINDS.includes(e.kind)) return null;
  if (e.tags.some(t => t[0] === 'encrypted')) return null;
  const meta = imetaEntries(e.tags)[0];
  let url: string | undefined;

  if (e.kind === 1063) {
    if (!tagValue(e.tags, 'm')?.startsWith('audio/')) return null;
    if (e.tags.some(t => t[0] === 'a' && /^3423[56]:/.test(t[1] ?? ''))) return null; // a short video's soundtrack
    url = tagValue(e.tags, 'url') ?? meta?.url;
  } else if (e.kind === 31337) {
    url = tagValue(e.tags, 'url') ?? tagValue(e.tags, 'media') ?? meta?.url;
  } else {
    // A note: an audio attachment (any file name), or a link to an audio file in the text.
    url = imetaEntries(e.tags).find(m => isHttpUrl(m.url) && m.m?.toLowerCase().startsWith('audio/'))?.url ?? e.content.match(AUDIO_URL)?.[0];
  }
  if (!isHttpUrl(url)) return null;

  return {
    id: `nostr:${e.id}`,
    kind: 'audio',
    hashtags: hashtagsOf(e.tags),
    origin: 'nostr',
    url,
    title: clip(tagValue(e.tags, 'title')) || (e.kind === 1 ? firstLine(e.content) : '') || nameFromUrl(url) || 'Untitled',
    subtitle: clip(tagValue(e.tags, 'artist')) || undefined,
    image: httpOrUndefined(tagValue(e.tags, 'image') ?? tagValue(e.tags, 'cover') ?? meta?.image),
    duration: parseDuration(tagValue(e.tags, 'duration') ?? meta?.duration, e.kind),
    pubkey: e.pubkey,
    createdAt: e.created_at,
  };
}

export function videoFromEvent(e: NostrEventLike): MediaItem | null {
  if (!VIDEO_KINDS.includes(e.kind)) return null;
  let url: string | undefined;
  let poster: string | undefined;

  if (e.kind === 1063) {
    if (!tagValue(e.tags, 'm')?.startsWith('video/')) return null;
    url = tagValue(e.tags, 'url');
  } else if (e.kind === 1) {
    url = e.content.match(VIDEO_URL)?.[0];
  } else {
    const metas = imetaEntries(e.tags);
    const playable = (m: Record<string, string>) => isHttpUrl(m.url) && !isYouTube(m.url) && (m.m?.startsWith('video/') || VIDEO_URL.test(m.url) || !m.m);
    const best = metas.find(m => playable(m) && m.m === 'video/mp4') ?? metas.find(playable);
    url = best?.url ?? tagValue(e.tags, 'url');
    poster = best?.image ?? best?.thumb;
  }
  if (!isHttpUrl(url) || isYouTube(url)) return null;

  const duration = parseDuration(tagValue(e.tags, 'duration') ?? imetaEntries(e.tags)[0]?.duration);
  // Under 30 seconds when the length is known; if it is not, the NIP-71 short kinds (22, 34236) say so.
  const short = duration !== undefined ? duration < SHORT_VIDEO_SECONDS : e.kind === 22 || e.kind === 34236;

  return {
    id: `nostr:${e.id}`,
    kind: 'video',
    origin: 'nostr',
    url,
    title: clip(tagValue(e.tags, 'title')) || clip(tagValue(e.tags, 'summary')) || firstLine(e.content) || nameFromUrl(url) || 'Untitled',
    image: httpOrUndefined(poster ?? tagValue(e.tags, 'image') ?? tagValue(e.tags, 'thumb')),
    duration,
    pubkey: e.pubkey,
    createdAt: e.created_at,
    short,
  };
}

export function imageFromEvent(e: NostrEventLike): MediaItem | null {
  if (!IMAGE_KINDS.includes(e.kind)) return null;
  let url: string | undefined;
  if (e.kind === 1063) {
    if (!tagValue(e.tags, 'm')?.startsWith('image/')) return null;
    url = tagValue(e.tags, 'url');
  } else if (e.kind === 20) {
    url = imetaEntries(e.tags).find(m => isHttpUrl(m.url) && (!m.m || m.m.startsWith('image/')))?.url;
  } else {
    url = e.content.match(IMAGE_URL)?.[0];
  }
  if (!isHttpUrl(url)) return null;
  return {
    id: `nostr:${e.id}`,
    kind: 'image',
    origin: 'nostr',
    url,
    title: clip(tagValue(e.tags, 'title')) || firstLine(e.content),
    pubkey: e.pubkey,
    createdAt: e.created_at,
    hashtags: hashtagsOf(e.tags),
  };
}

// The first sentence of a post, for the ticker: links and Nostr references removed, cut at the
// first full stop, "!" or "?" that is followed by a space or the end, and capped in length.
export const TICKER_MAX = 140;

export function firstSentence(text: string | undefined | null): string {
  const clean = stripNostrRefs((text ?? '').replace(ANY_URL, ' ')).replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const end = clean.match(/^(.+?[.!?\u2026]+)(?=\s|$)/);
  const sentence = end ? end[1] : clean;
  return sentence.length > TICKER_MAX ? `${sentence.slice(0, TICKER_MAX - 1).trimEnd()}\u2026` : sentence;
}

// Music vs podcast. RSS episodes are podcasts. Otherwise zapa's rule: longer than 9 minutes is a
// podcast, anything shorter is music. Plain notes carry no length, so the length is read from the
// audio file in the background (lib/durations.ts); until it is known, a post counts as a podcast only
// if it says so: a #podcast hashtag, or the word "podcast" or "episode" in its text.
const PODCAST_TAG = /^(podcasts?|podcasting|podcastindex|podcastsonnostr)$/;
const PODCAST_WORD = /\b(podcast|episode)\b/i;

export function isPodcast(item: MediaItem): boolean {
  if (item.origin === 'rss') return true;
  if (item.origin === 'local') return false;
  if (item.duration !== undefined) return item.duration > MUSIC_MAX_SECONDS;
  return (item.hashtags ?? []).some(t => PODCAST_TAG.test(t)) || PODCAST_WORD.test(item.title);
}

export function sortNewest(items: MediaItem[]): MediaItem[] {
  return [...items].sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
}

export function dedupeByUrl(items: MediaItem[]): MediaItem[] {
  const seen = new Set<string>();
  return items.filter(item => (seen.has(item.url) ? false : (seen.add(item.url), true)));
}
