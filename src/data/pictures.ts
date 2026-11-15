import { useEffect, useMemo, useRef } from 'react';
import type { NostrEvent } from 'applesauce-core/helpers';
import { dedupeByUrl, IMAGE_KINDS, imageFromEvent, sortNewest, type MediaItem } from '../lib/media.ts';
import { mediaFilters } from '../lib/mediaFilters.ts';
import { addPictures, PICTURE_CACHE_MAX, usePictureCache } from '../lib/pictureCache.ts';
import { RELAYS, eventStore, pool } from '../lib/applesauce.ts';
import { useOwn } from './ownContext.ts';
import { useContacts, useNostrItems } from './nostr.ts';
import { useFeedPubkey } from './people.ts';
import { useTagSet } from '../lib/tags.ts';

// Reaching back in time for older pictures (spec §Added later): one batch every 20 s until the cache is full
// or the relays have nothing older.
const OLDER_EVERY_MS = 20_000;

// The two sources of slideshow pictures: yours (the folders you added) and the others (posted by the people
// the feed account follows, and your picture hashtags). How they are mixed is the picture mix setting.
export interface PictureSources {
  mine: MediaItem[];
  others: MediaItem[];
}

// "mine" is the My pictures view: only the pictures on this device. "all" adds the Nostr ones: the newest from
// the relays plus the cache on this device, which keeps growing back in time in the background.
export function usePictures(scope: 'mine' | 'all'): PictureSources {
  const own = useOwn();
  const feed = useFeedPubkey();
  const contacts = useContacts(feed);
  const tags = useTagSet();
  const wantNostr = scope === 'all';
  const live = useNostrItems('image', wantNostr ? contacts : undefined, wantNostr ? tags.image : []);
  const cache = usePictureCache();

  // Every picture that arrives live also goes into the cache.
  useEffect(() => { if (live.length > 0) addPictures(live); }, [live]);

  // Only cached pictures that still belong: from people the feed follows, or with one of your picture hashtags.
  const others = useMemo(() => {
    if (!wantNostr) return [];
    const people = new Set(contacts ?? []);
    const wanted = new Set(tags.image.map(t => t.toLowerCase()));
    const fits = (p: MediaItem) => (p.pubkey !== undefined && people.has(p.pubkey)) || (p.hashtags ?? []).some(t => wanted.has(t));
    return dedupeByUrl(sortNewest([...live, ...cache.filter(fits)])).slice(0, PICTURE_CACHE_MAX);
  }, [wantNostr, live, cache, contacts, tags.image]);

  useOlderPictures(wantNostr ? contacts : undefined, wantNostr ? tags.image : [], others);

  return { mine: own.pictures.slice(0, PICTURE_CACHE_MAX), others };
}

// In the background, walk back in time for older pictures, a batch at a time. Each request (a group of people's
// media posts, their notes, the hashtags) keeps its own place in time: the oldest event its last batch
// returned. A request whose batch comes back empty has reached the start and stops.
function useOlderPictures(authors: string[] | undefined, hashtags: string[], known: MediaItem[]): void {
  const countRef = useRef(known.length);
  useEffect(() => { countRef.current = known.length; }, [known.length]);
  const key = `${(authors ?? []).join(',')}|${hashtags.join(',')}`;

  useEffect(() => {
    if (!authors) return;
    const filters = mediaFilters(IMAGE_KINDS, authors, hashtags);
    if (filters.length === 0) return;
    const until: (number | undefined)[] = filters.map(() => undefined);
    const finished = filters.map(() => false);
    let turn = 0;
    let busy = false;
    const askOlder = () => {
      if (busy || countRef.current >= PICTURE_CACHE_MAX) return;
      const open = filters.map((_, i) => i).filter(i => !finished[i]);
      if (open.length === 0) return;
      const i = open[turn++ % open.length];
      const filter = until[i] === undefined ? filters[i] : { ...filters[i], until: until[i] };
      busy = true;
      const found: MediaItem[] = [];
      let oldest = Infinity;
      pool.request([...RELAYS], [filter]).subscribe({
        next: (event: NostrEvent) => {
          eventStore.add(event);
          oldest = Math.min(oldest, event.created_at);
          const item = imageFromEvent(event);
          if (item) found.push(item);
        },
        error: (error: unknown) => { busy = false; console.error('[pictures] could not fetch older pictures:', error); },
        complete: () => {
          busy = false;
          if (oldest === Infinity) finished[i] = true; // nothing older: this request has reached the start
          else until[i] = oldest - 1;
          addPictures(found);
        },
      });
    };
    askOlder(); // the first batch right away (it is the newest page, which the live feed may not have whole)
    const timer = window.setInterval(askOlder, OLDER_EVERY_MS);
    return () => window.clearInterval(timer);
    // `key` stands for authors + hashtags
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
