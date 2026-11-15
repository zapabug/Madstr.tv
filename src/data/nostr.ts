import { useEffect, useMemo } from 'react';
import { use$ } from 'applesauce-react/hooks';
import { onlyEvents } from 'applesauce-relay';
import type { Filter, NostrEvent } from 'applesauce-core/helpers';
import { LOOKUP_RELAYS, RELAYS, eventStore, pool } from '../lib/applesauce.ts';
import {
  AUDIO_KINDS, IMAGE_KINDS, VIDEO_KINDS, audioFromEvent, dedupeByUrl, imageFromEvent, sortNewest, videoFromEvent,
  type MediaItem, type MediaKind,
} from '../lib/media.ts';

// The TV's own account (npub1a5ve7g6q…). Until someone logs in, the people it
// follows are who the board shows content from.
export const TV_PUBKEY = 'ed199f23408d7f90ec7387b1a9607d5962eae1baf8ba421cb864a09109d3262b';

const CONTACT_RELAYS = [...new Set([...LOOKUP_RELAYS, ...RELAYS])];
const PER_CHUNK_LIMIT = 300;
const AUTHORS_PER_FILTER = 100;
const HEX64 = /^[0-9a-f]{64}$/;

// Plain notes (kind 1) are most of what anyone posts, so they would crowd the rare media
// kinds out of a shared limit. Ask for the media kinds on their own, and notes separately.
const ALL_KINDS: Record<MediaKind, number[]> = { audio: AUDIO_KINDS, video: VIDEO_KINDS, image: IMAGE_KINDS };
const NOTES_LIMIT = 200;
const CONVERT: Record<MediaKind, (_e: NostrEvent) => MediaItem | null> = {
  audio: audioFromEvent, video: videoFromEvent, image: imageFromEvent,
};

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

// Open a live subscription on the relays and pour what arrives into the event store.
// Nothing here waits for a relay: items appear in the store as they come.
function useRelayFeed(filters: Filter[], key: string, relays: string[] = RELAYS): void {
  useEffect(() => {
    if (filters.length === 0) return;
    const sub = pool.subscription(relays, filters).pipe(onlyEvents()).subscribe({
      next: event => { eventStore.add(event); },
      error: error => { console.error('[nostr] subscription failed:', error); },
    });
    return () => sub.unsubscribe();
    // `key` stands for the content of `filters`, so the feed only restarts when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

// The pubkeys a person follows (their kind 3 contact list), or undefined until it arrives.
export function useContacts(pubkey: string | undefined): string[] | undefined {
  const filters = useMemo<Filter[]>(() => (pubkey ? [{ kinds: [3], authors: [pubkey], limit: 1 }] : []), [pubkey]);
  useRelayFeed(filters, `contacts:${pubkey ?? ''}`, CONTACT_RELAYS);
  const contacts = use$(() => (pubkey ? eventStore.replaceable(3, pubkey) : undefined), [pubkey]);
  return useMemo(() => {
    if (!contacts) return undefined;
    return [...new Set(contacts.tags.filter(t => t[0] === 'p' && HEX64.test(t[1] ?? '')).map(t => t[1]))];
  }, [contacts]);
}

// Playable items of one kind from a set of authors and/or hashtags, newest first.
export function useNostrItems(kind: MediaKind, authors: string[] | undefined, hashtags: string[] = []): MediaItem[] {
  const kinds = ALL_KINDS[kind];
  const rare = kinds.filter(k => k !== 1);
  const authorKey = authors ? authors.join(',') : '';
  const tagKey = hashtags.join(',');

  const filters = useMemo<Filter[]>(() => {
    const out: Filter[] = [];
    for (const group of chunk(authors ?? [], AUTHORS_PER_FILTER)) {
      out.push({ kinds: rare, authors: group, limit: PER_CHUNK_LIMIT });
      if (kinds.includes(1)) out.push({ kinds: [1], authors: group, limit: NOTES_LIMIT });
    }
    if (hashtags.length > 0) out.push({ kinds, '#t': hashtags, limit: PER_CHUNK_LIMIT });
    return out;
    // authors / hashtags are represented by their joined keys
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, authorKey, tagKey]);

  const key = `${kind}:${authorKey}:${tagKey}`;
  useRelayFeed(filters, key);
  const events = use$(() => (filters.length > 0 ? eventStore.timeline(filters) : undefined), [key]);

  return useMemo(() => {
    if (!events) return [];
    const items: MediaItem[] = [];
    for (const event of events) {
      const item = CONVERT[kind](event);
      if (item) items.push(item);
    }
    return dedupeByUrl(sortNewest(items));
  }, [events, kind]);
}
