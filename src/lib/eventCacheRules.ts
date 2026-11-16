import { audioFromEvent, tagValue, videoFromEvent, type NostrEventLike } from './media.ts';
import { STATION_KIND, stationFromEvent } from './radio.ts';

// Which Nostr events are kept on this device, and how many (spec feat-taste-cache §T3). Metadata only: the
// events' text and tags, never the media files. Pure; the IndexedDB side is eventCache.ts.

export type CacheGroup = 'audio' | 'video' | 'profile' | 'contacts' | 'station';

export const CACHE_CAPS: Record<CacheGroup, number> = {
  audio: 3000,
  video: 1500,
  profile: 3000,
  contacts: 20, // the board's follow list (the TV's and yours); a handful at most
  station: 2000, // radio stations (feat-radio: the device cache also keeps stations)
};

export interface StoredEvent extends NostrEventLike {
  sig: string;
}

export interface CacheEntry {
  key: string;
  group: CacheGroup;
  created_at: number;
  seen: number; // when it was last written (ms), for profiles
  event: StoredEvent;
}

const HEX64 = /^[0-9a-f]{64}$/;
const HEX128 = /^[0-9a-f]{128}$/;

// What group an event belongs in, or null to leave it out. Follow lists only of the accounts that feed the board.
export function cacheGroup(event: NostrEventLike, contactOwners: ReadonlySet<string>): CacheGroup | null {
  if (event.kind === 0) return 'profile';
  if (event.kind === 3) return contactOwners.has(event.pubkey) ? 'contacts' : null;
  if (audioFromEvent(event)) return 'audio';
  if (videoFromEvent(event)) return 'video';
  if (stationFromEvent(event)) return 'station';
  return null;
}

// Profiles and follow lists are replaceable: one entry per person, the newest wins.
export function cacheKey(event: NostrEventLike): string {
  if (event.kind === 0 || event.kind === 3) return `${event.kind}:${event.pubkey}`;
  // A station is addressable: one entry per station, the newest wins.
  if (event.kind === STATION_KIND) return `${event.kind}:${event.pubkey}:${tagValue(event.tags, 'd') ?? ''}`;
  return event.id;
}

// A plain copy (the store adds its own symbols to events).
export function plainEvent(e: StoredEvent): StoredEvent {
  return { id: e.id, pubkey: e.pubkey, created_at: e.created_at, kind: e.kind, tags: e.tags, content: e.content, sig: e.sig };
}

// An entry read back from the device, or null when it is not a well-formed event.
export function reviveCacheEntry(raw: unknown): CacheEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const e = r.event as Record<string, unknown> | undefined;
  if (!e || typeof e !== 'object') return null;
  if (typeof e.id !== 'string' || !HEX64.test(e.id) || typeof e.pubkey !== 'string' || !HEX64.test(e.pubkey)) return null;
  if (typeof e.sig !== 'string' || !HEX128.test(e.sig) || typeof e.content !== 'string') return null;
  if (!Number.isInteger(e.kind) || !Number.isFinite(e.created_at)) return null;
  if (!Array.isArray(e.tags) || !e.tags.every(t => Array.isArray(t) && t.every(v => typeof v === 'string'))) return null;
  const group = r.group;
  if (group !== 'audio' && group !== 'video' && group !== 'profile' && group !== 'contacts' && group !== 'station') return null;
  const event = plainEvent(e as unknown as StoredEvent);
  return { key: cacheKey(event), group, created_at: event.created_at, seen: Number.isFinite(r.seen) ? (r.seen as number) : 0, event };
}

// The keys to delete so each group keeps its newest `cap` (media by post time, profiles by when last seen).
export function overCap(entries: readonly CacheEntry[], caps: Record<CacheGroup, number> = CACHE_CAPS): string[] {
  const byGroup = new Map<CacheGroup, CacheEntry[]>();
  for (const e of entries) {
    const list = byGroup.get(e.group);
    if (list) list.push(e); else byGroup.set(e.group, [e]);
  }
  const drop: string[] = [];
  for (const [group, list] of byGroup) {
    if (list.length <= caps[group]) continue;
    const time = (e: CacheEntry) => (group === 'profile' ? e.seen : e.created_at);
    list.sort((a, b) => time(b) - time(a));
    for (const e of list.slice(caps[group])) drop.push(e.key);
  }
  return drop;
}
