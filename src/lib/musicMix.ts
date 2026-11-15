import { useSyncExternalStore } from 'react';
import type { MediaItem } from './media.ts';

// How much of your own local music plays in the Music list (spec feat-android-native §N3). One setting, kept
// on this device: 0 = none (the default) ... 1 = lots, about 8 in 10 tracks.
export const DEFAULT_OFTEN = 0;
export const MAX_SHARE = 0.8;
const KEY = 'madstr:musicMix';
const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

// Steps of 10 %: the slider's steps, so the note's "N in 10" is exact.
export function parseOften(raw: string | null): number {
  if (raw === null) return DEFAULT_OFTEN;
  try {
    const v = (JSON.parse(raw) as { often?: unknown }).often;
    return typeof v === 'number' && Number.isFinite(v) ? Math.round(clamp01(v) * 10) / 10 : DEFAULT_OFTEN;
  } catch {
    return DEFAULT_OFTEN;
  }
}

export function shareOfMine(often: number): number {
  return MAX_SHARE * clamp01(often);
}

// About `shareOfMine(often)` of the list is yours, spread evenly, each list in its own order; when one runs
// out, the rest is the other. Fixed, not random, so the list does not jump as new posts arrive.
export function mixMusic(others: readonly MediaItem[], mine: readonly MediaItem[], often: number): MediaItem[] {
  const share = shareOfMine(often);
  if (share <= 0 || mine.length === 0) return [...others];
  const out: MediaItem[] = [];
  let a = 0;
  let b = 0;
  while (a < others.length || b < mine.length) {
    const wantMine = Math.floor((out.length + 1) * share + 1e-9) > b;
    if (b < mine.length && (wantMine || a >= others.length)) out.push(mine[b++]);
    else out.push(others[a++]);
  }
  return out;
}

// --- the saved setting, shared by the Sources card and the Music list ---
let current: number | null = null;
const listeners = new Set<() => void>();

function read(): number {
  if (current === null) {
    try { current = parseOften(localStorage.getItem(KEY)); } catch { current = DEFAULT_OFTEN; }
  }
  return current;
}

export function setMusicMix(often: number): void {
  current = parseOften(JSON.stringify({ often }));
  try { localStorage.setItem(KEY, JSON.stringify({ often: current })); } catch { /* kept for this session */ }
  listeners.forEach(fn => fn());
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function useMusicMix(): number {
  return useSyncExternalStore(subscribe, read, read);
}
