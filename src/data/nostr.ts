import { useEffect, useMemo } from 'react';
import { use$ } from 'applesauce-react/hooks';
import { onlyEvents } from 'applesauce-relay';
import type { Filter, NostrEvent } from 'applesauce-core/helpers';
import { RELAYS, eventStore, pool } from '../lib/applesauce.ts';
import { CONTACT_RELAYS } from '../lib/relays.ts';
import {
  AUDIO_KINDS, IMAGE_KINDS, VIDEO_KINDS, audioFromEvent, dedupeByUrl, imageFromEvent, sortNewest, videoFromEvent,
  type MediaItem, type MediaKind,
} from '../lib/media.ts';
import { chunk, mediaFilters } from '../lib/mediaFilters.ts';

// The TV's own account (npub1a5ve7g6q…). Until someone logs in, the people it
// follows are who the board shows content from.
export const TV_PUBKEY = 'ed199f23408d7f90ec7387b1a9607d5962eae1baf8ba421cb864a09109d3262b';

const HEX64 = /^[0-9a-f]{64}$/;

// Which event kinds each kind of media comes in; the filters are built by lib/mediaFilters.ts.
export const ALL_KINDS: Record<MediaKind, number[]> = { audio: AUDIO_KINDS, video: VIDEO_KINDS, image: IMAGE_KINDS };
export const CONVERT: Record<MediaKind, (_e: NostrEvent) => MediaItem | null> = {
  audio: audioFromEvent, video: videoFromEvent, image: imageFromEvent,
};

export { chunk };

// Open a live subscription on the relays and pour what arrives into the event store.
// Nothing here waits for a relay: items appear in the store as they come.
export function useRelayFeed(filters: Filter[], key: string, relays: readonly string[] = RELAYS): void {
  useEffect(() => {
    if (filters.length === 0) return;
    const sub = pool.subscription([...relays], filters).pipe(onlyEvents()).subscribe({
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
  const authorKey = authors ? authors.join(',') : '';
  const tagKey = hashtags.join(',');

  const filters = useMemo<Filter[]>(() => {
    return mediaFilters(kinds, authors ?? [], hashtags);
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
