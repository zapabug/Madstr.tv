import { useEffect, useMemo, useState } from 'react';
import type { MediaItem } from './media.ts';
import { readCacheValue, writeCacheValue } from './eventCache.ts';

// Notes carry no length, but "podcast = longer than 9 minutes" needs one. So the length is read from
// the audio file itself (only its first bytes, `preload="metadata"`), a few at a time, for the first
// items of a list. This does contact each audio host, like loading a cover image would. Results are
// remembered on the device, newest 5000 (spec feat-taste-cache §T3).

const MAX_PROBES = 40;
const CONCURRENCY = 3;
const TIMEOUT_MS = 8000;

const KEEP = 5000;
const CACHE_KEY = 'durations';
const SAVE_MS = 3000;

const known = new Map<string, number>(); // url -> seconds; 0 = could not be read
const waiting: string[] = [];
let running = 0;
const listeners = new Set<() => void>();

function probe(url: string): Promise<number> {
  return new Promise(resolve => {
    const audio = new Audio();
    let finished = false;
    const finish = (seconds: number) => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      audio.removeAttribute('src');
      audio.load();
      resolve(seconds);
    };
    const timer = window.setTimeout(() => finish(0), TIMEOUT_MS);
    audio.preload = 'metadata';
    audio.addEventListener('loadedmetadata', () => finish(Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0));
    audio.addEventListener('error', () => finish(0));
    audio.src = url;
  });
}

// The newest `max` lengths (a Map keeps the order they were learned in), as stored pairs.
export function keepNewest(entries: Iterable<[string, number]>, max = KEEP): [string, number][] {
  const all = [...entries];
  return all.slice(Math.max(0, all.length - max));
}

// Stored pairs read back as untrusted: http(s) URLs and finite, non-negative lengths only.
export function reviveLengths(raw: unknown): [string, number][] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((p): p is [string, number] => Array.isArray(p) && typeof p[0] === 'string' && /^https?:\/\//i.test(p[0])
    && typeof p[1] === 'number' && Number.isFinite(p[1]) && p[1] >= 0).slice(-KEEP);
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function save(): void {
  saveTimer ??= setTimeout(() => {
    saveTimer = undefined;
    // Failed reads (0) are not kept: the file may answer next time.
    void writeCacheValue(CACHE_KEY, keepNewest([...known].filter(([, s]) => s > 0)));
  }, SAVE_MS);
}

/** Read the lengths kept on the device. Never awaited; what is measured meanwhile wins. */
export function startDurationCache(): void {
  void readCacheValue(CACHE_KEY).then(raw => {
    const stored = reviveLengths(raw);
    if (stored.length === 0) return;
    const fresh = [...known];
    known.clear();
    for (const [url, seconds] of [...stored, ...fresh]) known.set(url, seconds);
    listeners.forEach(fn => fn());
  });
}

function pump(): void {
  while (running < CONCURRENCY && waiting.length > 0) {
    const url = waiting.shift() as string;
    running += 1;
    void probe(url).then(seconds => {
      known.set(url, seconds);
      save();
      running -= 1;
      listeners.forEach(fn => fn());
      pump();
    });
  }
}

function request(urls: string[]): void {
  for (const url of urls) {
    if (!known.has(url) && !waiting.includes(url)) waiting.push(url);
  }
  pump();
}

// The same items, with `duration` filled in where it was unknown and has since been read. `deep` (an open Music or
// Podcasts list): measuring keeps going down the whole list, 40 waiting at a time, so older posts are measured too
// and old podcasts are found (zapa, 2026-11-17: "im missing a bunch of old podcasts only find most recent ones").
// Without it (the board's previews) only the first 40 items are measured.
export function useProbedDurations(items: MediaItem[], deep = false): MediaItem[] {
  const [version, setVersion] = useState(0);
  const unknown = (i: MediaItem) => i.kind === 'audio' && i.origin === 'nostr' && i.duration === undefined && !known.has(i.url);
  const key = (deep ? items.filter(unknown) : items).slice(0, MAX_PROBES).map(i => i.url).join('\n');

  useEffect(() => {
    const onChange = () => setVersion(v => v + 1);
    listeners.add(onChange);
    return () => { listeners.delete(onChange); };
  }, []);

  useEffect(() => {
    if (deep) request(items.filter(unknown).slice(0, MAX_PROBES).map(i => i.url));
    else request(items.slice(0, MAX_PROBES).filter(i => i.kind === 'audio' && i.origin === 'nostr' && i.duration === undefined).map(i => i.url));
    // the list is represented by its keyed urls
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return useMemo(() => items.map(item => {
    if (item.duration !== undefined) return item;
    const seconds = known.get(item.url);
    return seconds ? { ...item, duration: seconds } : item;
  }),
  // version bumps when a length arrives
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [items, version]);
}
