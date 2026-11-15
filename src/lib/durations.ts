import { useEffect, useMemo, useState } from 'react';
import type { MediaItem } from './media.ts';

// Notes carry no length, but "podcast = longer than 9 minutes" needs one. So the length is read from
// the audio file itself (only its first bytes, `preload="metadata"`), a few at a time, for the first
// items of a list. This does contact each audio host, like loading a cover image would. Results are
// remembered for the session.

const MAX_PROBES = 40;
const CONCURRENCY = 3;
const TIMEOUT_MS = 8000;

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

function pump(): void {
  while (running < CONCURRENCY && waiting.length > 0) {
    const url = waiting.shift() as string;
    running += 1;
    void probe(url).then(seconds => {
      known.set(url, seconds);
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

// The same items, with `duration` filled in where it was unknown and has since been read.
export function useProbedDurations(items: MediaItem[]): MediaItem[] {
  const [version, setVersion] = useState(0);
  const key = items.slice(0, MAX_PROBES).map(i => i.url).join('\n');

  useEffect(() => {
    const onChange = () => setVersion(v => v + 1);
    listeners.add(onChange);
    return () => { listeners.delete(onChange); };
  }, []);

  useEffect(() => {
    request(items.filter(i => i.kind === 'audio' && i.origin === 'nostr' && i.duration === undefined).slice(0, MAX_PROBES).map(i => i.url));
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
