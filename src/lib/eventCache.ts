import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { NostrEvent } from 'applesauce-core/helpers';
import { eventStore } from './applesauce.ts';
import {
  cacheGroup, cacheKey, overCap, plainEvent, reviveCacheEntry, type CacheEntry,
} from './eventCacheRules.ts';

// The device cache of Nostr metadata (spec feat-taste-cache §T3): music, video, profile and follow-list events
// the app has seen are kept in IndexedDB and put back into the event store at start, so lists, faces and names
// show before any relay answers. Never the media files. Nothing waits on it: the app renders at once and the
// cache pours in when read. Rules (what, how many) are in eventCacheRules.ts.

const DB_NAME = 'MadstrEventCache';
const FLUSH_MS = 3000;

interface CacheDB extends DBSchema {
  events: { key: string; value: CacheEntry };
  kv: { key: string; value: unknown };
}

let dbPromise: Promise<IDBPDatabase<CacheDB>> | null = null;
function db(): Promise<IDBPDatabase<CacheDB>> {
  dbPromise ??= openDB<CacheDB>(DB_NAME, 1, {
    upgrade(d) {
      d.createObjectStore('events', { keyPath: 'key' });
      d.createObjectStore('kv');
    },
  });
  return dbPromise;
}

// Whose follow lists are kept: the accounts that feed the board (the TV's, and yours when logged in).
const contactOwners = new Set<string>();
export function keepContactsOf(pubkey: string): void {
  contactOwners.add(pubkey);
}

const pending = new Map<string, CacheEntry>();
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let restoring = false;

function queue(event: NostrEvent): void {
  if (restoring) return; // what is being put back is already on the device
  const group = cacheGroup(event, contactOwners);
  if (!group) return;
  const plain = plainEvent(event);
  pending.set(cacheKey(plain), { key: cacheKey(plain), group, created_at: plain.created_at, seen: Date.now(), event: plain });
  flushTimer ??= setTimeout(flush, FLUSH_MS);
}

async function flush(): Promise<void> {
  flushTimer = undefined;
  if (pending.size === 0) return;
  const batch = [...pending.values()];
  pending.clear();
  try {
    const tx = (await db()).transaction('events', 'readwrite');
    await Promise.all([...batch.map(e => tx.store.put(e)), tx.done]);
  } catch (error) {
    console.warn('[cache] could not save events:', error);
  }
}

let started = false;

/** Put the cached events back into the store, then keep saving new ones. Call once at start; never awaited. */
export function startEventCache(): void {
  if (started || typeof indexedDB === 'undefined') return;
  started = true;
  eventStore.insert$.subscribe(queue);
  void (async () => {
    try {
      const d = await db();
      const entries = (await d.getAll('events')).map(reviveCacheEntry).filter((e): e is CacheEntry => e !== null);
      // Over the caps: the oldest go, from the device and from what is put back.
      const drop = new Set(overCap(entries));
      restoring = true;
      try {
        for (const entry of entries) if (!drop.has(entry.key)) eventStore.add(entry.event as NostrEvent);
      } finally {
        restoring = false;
      }
      if (drop.size > 0) {
        const tx = d.transaction('events', 'readwrite');
        await Promise.all([...[...drop].map(key => tx.store.delete(key)), tx.done]);
      }
    } catch (error) {
      console.warn('[cache] could not read the device cache:', error);
    }
  })();
}

/** A small value kept beside the events (lengths of audio files). */
export async function readCacheValue(key: string): Promise<unknown> {
  if (typeof indexedDB === 'undefined') return undefined;
  try { return await (await db()).get('kv', key); } catch { return undefined; }
}

export async function writeCacheValue(key: string, value: unknown): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try { await (await db()).put('kv', value, key); } catch { /* storage full or blocked: this session only */ }
}
