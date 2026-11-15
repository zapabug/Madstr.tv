import { useSyncExternalStore } from 'react';

// "Liked npubs": people zapa likes, kept on this device. A like is a bookmark for the
// Liked sticker, not a Nostr event, so it needs no login and nothing is published.

const KEY = 'madstr:liked';
const MAX_LIKED = 500;
const HEX64 = /^[0-9a-f]{64}$/;

export function parseLiked(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((v): v is string => typeof v === 'string' && HEX64.test(v)))].slice(0, MAX_LIKED);
  } catch {
    return [];
  }
}

// Newest like first, so the Liked view leads with whoever you liked last.
export function toggleLiked(list: string[], pubkey: string): string[] {
  if (!HEX64.test(pubkey)) return list;
  if (list.includes(pubkey)) return list.filter(p => p !== pubkey);
  return [pubkey, ...list].slice(0, MAX_LIKED);
}

let current: string[] | null = null;
const listeners = new Set<() => void>();

function read(): string[] {
  if (current === null) {
    try { current = parseLiked(localStorage.getItem(KEY)); } catch { current = []; }
  }
  return current;
}

export function toggleLike(pubkey: string): void {
  current = toggleLiked(read(), pubkey);
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* the list still works for this session */ }
  listeners.forEach(fn => fn());
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function useLiked(): string[] {
  return useSyncExternalStore(subscribe, read, read);
}
