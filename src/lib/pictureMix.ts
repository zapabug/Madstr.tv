import { useSyncExternalStore } from 'react';

// How your own pictures and the slideshow's pictures (from Nostr) share the screen. Two general settings,
// kept on this device: only your pictures, or mixed in; and, when mixed, how often yours come up.

export interface PictureMix {
  onlyMine: boolean;
  often: number; // 0 = seldom ... 1 = very often
}

export const DEFAULT_MIX: PictureMix = { onlyMine: false, often: 0.5 };

const KEY = 'madstr:pictureMix';
const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

export function parseMix(raw: string | null): PictureMix {
  if (!raw) return DEFAULT_MIX;
  try {
    const value = JSON.parse(raw) as Partial<PictureMix>;
    return {
      onlyMine: value.onlyMine === true,
      often: typeof value.often === 'number' && Number.isFinite(value.often) ? clamp01(value.often) : DEFAULT_MIX.often,
    };
  } catch {
    return DEFAULT_MIX;
  }
}

// The chance that the next picture is yours, when mixed: about 1 in 20 at "seldom", 4 in 5 at "very often".
export function shareOf(often: number): number {
  return 0.05 + 0.75 * clamp01(often);
}

// How many pictures the slideshow can actually show with these settings.
export function availableCount(mine: number, others: number, mix: PictureMix): number {
  return mix.onlyMine && mine > 0 ? mine : mine + others;
}

// The next picture: yours or the slideshow's, by the settings, never one of the `recent` ones while
// there is something else in that pool. Null when there is nothing to show.
export function pickNext(mine: readonly string[], others: readonly string[], mix: PictureMix, recent: readonly string[], rand: () => number = Math.random): string | null {
  if (mine.length === 0 && others.length === 0) return null;
  let useMine: boolean;
  if (mix.onlyMine && mine.length > 0) useMine = true;
  else if (mine.length === 0) useMine = false;
  else if (others.length === 0) useMine = true;
  else useMine = rand() < shareOf(mix.often);
  const pool = useMine ? mine : others;
  const fresh = pool.filter(url => !recent.includes(url));
  const from = fresh.length > 0 ? fresh : pool;
  return from[Math.floor(rand() * from.length)] ?? null;
}

// The pictures already shown (so Previous can go back) with a cursor on the one on screen.
export interface History {
  urls: string[];
  cursor: number;
}

const MAX_HISTORY = 60;

// Keep one picture queued after the one on screen: add `next` when the cursor is at the end.
export function ensureAhead(h: History, next: string | null): History {
  if (!next || h.cursor < h.urls.length - 1) return h;
  const urls = [...h.urls, next];
  const drop = Math.max(0, urls.length - MAX_HISTORY);
  return { urls: urls.slice(drop), cursor: Math.max(0, h.cursor - drop) };
}

export function step(h: History, dir: 1 | -1): History {
  const cursor = Math.min(Math.max(h.cursor + dir, 0), Math.max(0, h.urls.length - 1));
  return cursor === h.cursor ? h : { ...h, cursor };
}

// --- the saved settings, shared by the Sources card and the slideshow ---
let current: PictureMix | null = null;
const listeners = new Set<() => void>();

function read(): PictureMix {
  if (current === null) {
    try { current = parseMix(localStorage.getItem(KEY)); } catch { current = DEFAULT_MIX; }
  }
  return current;
}

export function setMix(patch: Partial<PictureMix>): void {
  current = parseMix(JSON.stringify({ ...read(), ...patch }));
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* kept for this session */ }
  listeners.forEach(fn => fn());
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function usePictureMix(): PictureMix {
  return useSyncExternalStore(subscribe, read, read);
}
