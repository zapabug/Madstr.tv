import { useSyncExternalStore } from 'react';

// The two lava-lamp settings (spec feat-lava-lamp LL5). The parser is pure; the store follows the app's other saved
// settings (pictureMix, musicMix): read once from localStorage, keep in memory, notify on change. Storage is untrusted.

export const LAVA_KEY = 'madstr:lava';
export type LavaStyle = 'focused' | 'smoky';
export interface LavaSettings { on: boolean; style: LavaStyle }

export const DEFAULT_LAVA: LavaSettings = { on: true, style: 'smoky' };

export function parseLava(raw: string | null): LavaSettings {
  if (!raw) return DEFAULT_LAVA;
  try {
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== 'object') return DEFAULT_LAVA;
    const o = v as Record<string, unknown>;
    return {
      on: typeof o.on === 'boolean' ? o.on : DEFAULT_LAVA.on,
      style: o.style === 'focused' || o.style === 'smoky' ? o.style : DEFAULT_LAVA.style,
    };
  } catch { return DEFAULT_LAVA; }
}

export function serializeLava(s: LavaSettings): string {
  return JSON.stringify({ on: s.on, style: s.style });
}

let current: LavaSettings | null = null;
const listeners = new Set<() => void>();

function read(): LavaSettings {
  if (current === null) {
    try { current = parseLava(localStorage.getItem(LAVA_KEY)); } catch { current = DEFAULT_LAVA; }
  }
  return current;
}

export function setLava(patch: Partial<LavaSettings>): void {
  current = parseLava(JSON.stringify({ ...read(), ...patch }));
  try { localStorage.setItem(LAVA_KEY, serializeLava(current)); } catch { /* kept for this session */ }
  listeners.forEach(fn => fn());
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function useLava(): LavaSettings {
  return useSyncExternalStore(subscribe, read, read);
}
