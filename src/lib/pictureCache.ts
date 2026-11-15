import { useSyncExternalStore } from 'react';
import { clip, dedupeByUrl, isHttpUrl, sortNewest, type MediaItem } from './media.ts';

// Nostr pictures kept on this device across sessions, so the slideshow starts with a big pool instead of only
// the newest posts (spec §Added later, "Pictures repeat far less"). Stored in localStorage; read back as
// untrusted (only http(s) URLs, clipped text).
export const PICTURE_CACHE_MAX = 2000;
const KEY = 'madstr:pictureCache';

// Newest first, one entry per URL, at most `max`.
export function mergePictures(existing: readonly MediaItem[], incoming: readonly MediaItem[], max = PICTURE_CACHE_MAX): MediaItem[] {
  if (incoming.length === 0) return [...existing];
  return dedupeByUrl(sortNewest([...incoming, ...existing])).slice(0, max);
}

// A stored entry back into a picture, or null when it is not a safe one.
export function reviveEntry(raw: unknown): MediaItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !isHttpUrl(typeof r.url === 'string' ? r.url : undefined)) return null;
  const createdAt = Number(r.createdAt);
  if (!Number.isFinite(createdAt)) return null;
  return {
    id: r.id.slice(0, 80),
    kind: 'image',
    origin: 'nostr',
    url: r.url as string,
    title: clip(typeof r.title === 'string' ? r.title : ''),
    pubkey: typeof r.pubkey === 'string' && /^[0-9a-f]{64}$/.test(r.pubkey) ? r.pubkey : undefined,
    createdAt,
    hashtags: Array.isArray(r.hashtags) ? r.hashtags.filter((t): t is string => typeof t === 'string').map(t => t.slice(0, 30)).slice(0, 8) : undefined,
  };
}

function load(): MediaItem[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.map(reviveEntry).filter((i): i is MediaItem => i !== null).slice(0, PICTURE_CACHE_MAX) : [];
  } catch {
    return [];
  }
}

let pictures: MediaItem[] | null = null;
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | undefined;

function all(): MediaItem[] {
  if (pictures === null) pictures = load();
  return pictures;
}

export function addPictures(incoming: readonly MediaItem[]): number {
  const before = all();
  const next = mergePictures(before, incoming);
  const added = next.filter(i => !before.some(b => b.url === i.url)).length;
  if (added === 0 && next.length === before.length) return 0;
  pictures = next;
  listeners.forEach(fn => fn());
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const slim = (pictures ?? []).map(({ id, url, title, pubkey, createdAt, hashtags }) => ({ id, url, title, pubkey, createdAt, hashtags }));
      localStorage.setItem(KEY, JSON.stringify(slim));
    } catch { /* storage full or blocked: the cache lives for this session only */ }
  }, 2000);
  return added;
}

export function usePictureCache(): MediaItem[] {
  return useSyncExternalStore(
    fn => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    all,
    all,
  );
}
