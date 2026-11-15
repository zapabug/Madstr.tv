// The small pieces of player behaviour that are plain logic.
import { mergeOrder, shuffled } from './shuffle.ts';

// Where "next" goes: the following item, or null at the end of the queue.
export function nextIndex(index: number, length: number): number | null {
  return index + 1 < length ? index + 1 : null;
}

// "Previous" restarts the item when it has been playing a while, like a CD player.
export function prevAction(position: number, index: number): 'restart' | 'previous' {
  return position > 5 || index <= 0 ? 'restart' : 'previous';
}

// Where to resume: not at the very start, and not inside the last seconds.
export function resumeTime(saved: number | undefined, duration: number): number {
  if (saved === undefined || !Number.isFinite(saved) || saved < 5) return 0;
  if (Number.isFinite(duration) && duration > 0 && saved > duration - 10) return 0;
  return saved;
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export const RATES = [1, 1.25, 1.5, 2, 0.75] as const;

export function nextRate(rate: number): number {
  const i = RATES.findIndex(r => r === rate);
  return RATES[(i + 1) % RATES.length];
}

// Playback speed is remembered per queue label (Music, Podcasts, Short videos, …): people listen to
// podcasts fast and music at 1×, and asking them to re-set it every time the mode changes is rude.
export function rateKey(label: string): string {
  return `madstr:rate:${label.toLowerCase().replace(/[^a-z]+/g, '-')}`;
}

export function validRate(value: unknown): number | null {
  return typeof value === 'number' && (RATES as readonly number[]).includes(value) ? value : null;
}

// --- shuffle (spec §Added later) -----------------------------------------------------------------
// The playlist is a list of items with ids. Shuffling keeps the item playing first and puts the rest
// in a random order; items that arrive later are mixed in at the end; turning shuffle off goes back to
// the normal order. All three keep the same item playing, so they return where it now sits.

export interface Ordered<T> { queue: T[]; index: number }

export function shuffleAround<T extends { id: string }>(items: readonly T[], currentId: string | undefined, rand: () => number = Math.random): Ordered<T> {
  const current = items.find(i => i.id === currentId);
  const rest = shuffled(items.filter(i => i !== current), rand);
  return current ? { queue: [current, ...rest], index: 0 } : { queue: rest, index: rest.length > 0 ? 0 : -1 };
}

export function mergeShuffled<T extends { id: string }>(shuffledNow: readonly T[], natural: readonly T[], currentId: string | undefined, rand: () => number = Math.random): Ordered<T> {
  const byId = new Map(natural.map(i => [i.id, i]));
  const ids = mergeOrder(shuffledNow.map(i => i.id), natural.map(i => i.id), rand);
  const queue = ids.map(id => byId.get(id) as T);
  return { queue, index: queue.findIndex(i => i.id === currentId) };
}

export function unshuffle<T extends { id: string }>(natural: readonly T[], currentId: string | undefined): Ordered<T> {
  return { queue: [...natural], index: natural.findIndex(i => i.id === currentId) };
}
