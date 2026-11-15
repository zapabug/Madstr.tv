import { useSyncExternalStore } from 'react';

// Hashtag discovery, as in the first Madstr: besides the people you follow, a feed can pull
// in anything tagged with the hashtags you choose (#music, #podcast, #photography ...).
// Kept on this device, one list per kind of media.

export type TagKind = 'audio' | 'video' | 'image';
export type TagSet = Record<TagKind, string[]>;

const KEY = 'madstr:tags';
const MAX_TAGS = 12;
const TAG = /^[a-z0-9_-]{1,30}$/;

export function normalizeTag(input: string): string | null {
  const tag = input.trim().replace(/^#+/, '').toLowerCase();
  return TAG.test(tag) ? tag : null;
}

export function parseTags(raw: string | null): TagSet {
  const empty: TagSet = { audio: [], video: [], image: [] };
  if (!raw) return empty;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return empty;
    for (const kind of Object.keys(empty) as TagKind[]) {
      const list = (value as Record<string, unknown>)[kind];
      if (Array.isArray(list)) {
        empty[kind] = [...new Set(list.filter((t): t is string => typeof t === 'string' && TAG.test(t)))].slice(0, MAX_TAGS);
      }
    }
    return empty;
  } catch {
    return empty;
  }
}

export function addTag(list: string[], input: string): string[] {
  const tag = normalizeTag(input);
  if (!tag || list.includes(tag) || list.length >= MAX_TAGS) return list;
  return [...list, tag];
}

export function removeTag(list: string[], tag: string): string[] {
  return list.filter(t => t !== tag);
}

let current: TagSet | null = null;
const listeners = new Set<() => void>();

function read(): TagSet {
  if (current === null) {
    try { current = parseTags(localStorage.getItem(KEY)); } catch { current = parseTags(null); }
  }
  return current;
}

function commit(next: TagSet): void {
  current = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* kept for this session */ }
  listeners.forEach(fn => fn());
}

export function addTagTo(kind: TagKind, input: string): void {
  const now = read();
  commit({ ...now, [kind]: addTag(now[kind], input) });
}

export function removeTagFrom(kind: TagKind, tag: string): void {
  const now = read();
  commit({ ...now, [kind]: removeTag(now[kind], tag) });
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function useTagSet(): TagSet {
  return useSyncExternalStore(subscribe, read, read);
}
