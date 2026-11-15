import { useSyncExternalStore } from 'react';
import { clip, type MediaItem } from './media.ts';

// What you like and do not want to hear, kept on this device (spec feat-taste-cache §T2):
//  - up votes: lit on the controls; a published like (kind 7) is remembered so a second press can withdraw it;
//  - down votes (zapa: the same as hiding the song) and hidden artists: gone from every list until brought back.
// Stored in localStorage and read back as untrusted (ids and names clipped, pubkeys checked).

export const TASTE_KEY = 'madstr:taste';
export const MAX_VOTES = 2000;
export const MAX_HIDDEN_SONGS = 2000;

const HEX64 = /^[0-9a-f]{64}$/;
const MAX_ID = 200;

export interface UpVote { at: number; reaction?: string } // reaction: the id of the like published for it
export interface Hidden { name: string; at: number }

export interface Taste {
  up: Record<string, UpVote>;
  songs: Record<string, Hidden>; // down-voted songs
  artists: Record<string, Hidden>;
}

export const EMPTY_TASTE: Taste = { up: {}, songs: {}, artists: {} };

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const goodId = (id: string) => id.length > 0 && id.length <= MAX_ID;
const goodTime = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

// The newest `max` entries of a record, by their time.
export function newestEntries<T>(record: Record<string, T>, max: number, at: (_v: T) => number): Record<string, T> {
  const entries = Object.entries(record);
  if (entries.length <= max) return record;
  return Object.fromEntries(entries.sort((a, b) => at(b[1]) - at(a[1])).slice(0, max));
}

export function parseTaste(raw: unknown): Taste {
  if (!isRecord(raw)) return EMPTY_TASTE;
  const up: Record<string, UpVote> = {};
  if (isRecord(raw.up)) {
    for (const [id, v] of Object.entries(raw.up)) {
      if (!goodId(id) || !isRecord(v) || !goodTime(v.at)) continue;
      up[id] = typeof v.reaction === 'string' && HEX64.test(v.reaction) ? { at: v.at, reaction: v.reaction } : { at: v.at };
    }
  }
  const hidden = (value: unknown, key: (_k: string) => boolean): Record<string, Hidden> => {
    const out: Record<string, Hidden> = {};
    if (!isRecord(value)) return out;
    for (const [k, v] of Object.entries(value)) {
      if (!key(k) || !isRecord(v) || !goodTime(v.at)) continue;
      out[k] = { name: clip(typeof v.name === 'string' ? v.name : '') || 'Untitled', at: v.at };
    }
    return out;
  };
  return {
    up: newestEntries(up, MAX_VOTES, v => v.at),
    songs: newestEntries(hidden(raw.songs, goodId), MAX_HIDDEN_SONGS, v => v.at),
    artists: hidden(raw.artists, k => HEX64.test(k)),
  };
}

// --- changes (pure: each returns a new Taste) ---------------------------------------------

export function withUpVote(taste: Taste, id: string, at: number, reaction?: string): Taste {
  const up = newestEntries({ ...taste.up, [id]: reaction ? { at, reaction } : { at } }, MAX_VOTES, v => v.at);
  return { ...taste, up };
}

export function withoutUpVote(taste: Taste, id: string): Taste {
  const { [id]: _gone, ...up } = taste.up;
  return { ...taste, up };
}

// A down vote: the song is hidden, and an up vote it had is gone.
export function withDownVote(taste: Taste, item: Pick<MediaItem, 'id' | 'title'>, at: number): Taste {
  const { [item.id]: _gone, ...up } = taste.up;
  return { ...taste, up, songs: newestEntries({ ...taste.songs, [item.id]: { name: clip(item.title) || 'Untitled', at } }, MAX_HIDDEN_SONGS, v => v.at) };
}

export function withHiddenArtist(taste: Taste, pubkey: string, name: string, at: number): Taste {
  if (!HEX64.test(pubkey)) return taste;
  return { ...taste, artists: { ...taste.artists, [pubkey]: { name: clip(name) || 'Someone', at } } };
}

export function withSongBack(taste: Taste, id: string): Taste {
  const { [id]: _gone, ...songs } = taste.songs;
  return { ...taste, songs };
}

export function withArtistBack(taste: Taste, pubkey: string): Taste {
  const { [pubkey]: _gone, ...artists } = taste.artists;
  return { ...taste, artists };
}

// A list as your taste wants it: down-voted songs and hidden artists gone.
export function applyTaste(items: MediaItem[], taste: Taste): MediaItem[] {
  if (Object.keys(taste.songs).length === 0 && Object.keys(taste.artists).length === 0) return items;
  return items.filter(i => !(i.id in taste.songs) && !(i.pubkey !== undefined && i.pubkey in taste.artists));
}

// --- the store on this device ---------------------------------------------------------------

let current: Taste | null = null;
const listeners = new Set<() => void>();

function load(): Taste {
  try { return parseTaste(JSON.parse(localStorage.getItem(TASTE_KEY) ?? 'null')); } catch { return EMPTY_TASTE; }
}

export function getTaste(): Taste {
  if (current === null) current = load();
  return current;
}

export function setTaste(change: (_t: Taste) => Taste): void {
  current = change(getTaste());
  try { localStorage.setItem(TASTE_KEY, JSON.stringify(current)); } catch { /* storage blocked: this session only */ }
  listeners.forEach(fn => fn());
}

export function useTaste(): Taste {
  return useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, getTaste, getTaste);
}
