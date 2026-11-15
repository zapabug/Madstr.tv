import { useEffect, useRef, useState } from 'react';
import { matchFilter, type Filter, type NostrEvent } from 'applesauce-core/helpers';
import { RELAYS, eventStore, pool } from '../lib/applesauce.ts';
import { CACHE_CAPS } from '../lib/eventCacheRules.ts';
import { mediaFilters } from '../lib/mediaFilters.ts';
import { advanceWalk, batchesWanted, fingerprint, openRequests, parseWalk, type WalkState } from '../lib/walk.ts';
import { ALL_KINDS } from './nostr.ts';

// Reach back in time for older music or videos while their list is open (spec feat-taste-cache §T4): one batch
// when the list opens, one more for every 30 items it drops, until the device cache is full for that kind or
// the relays have nothing older. A batch asks every request that is not finished for its next page back; what
// arrives goes into the store (and from there into the device cache and the list).

const storeKey = (kind: string) => `madstr:walk:${kind}`;

function loadWalk(kind: string, key: string, n: number): WalkState {
  try { return parseWalk(JSON.parse(localStorage.getItem(storeKey(kind)) ?? 'null'), key, n); } catch { return parseWalk(null, key, n); }
}
function saveWalk(kind: string, walk: WalkState): void {
  try { localStorage.setItem(storeKey(kind), JSON.stringify(walk)); } catch { /* storage blocked: this session only */ }
}

export function useOlderMedia(kind: 'audio' | 'video', authors: string[] | undefined, hashtags: string[], dropped: number, known: number): void {
  const wanted = batchesWanted(dropped);
  const key = authors ? `${authors.join(',')}|${hashtags.join(',')}` : '';
  const run = useRef<{ key: string; filters: Filter[]; walk: WalkState; done: number; busy: boolean } | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!authors) { run.current = null; return; }
    const filters = mediaFilters(ALL_KINDS[kind], authors, hashtags);
    run.current = { key, filters, walk: loadWalk(kind, fingerprint(key), filters.length), done: 0, busy: false };
    setTick(t => t + 1);
    // `key` stands for authors + hashtags
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, kind]);

  useEffect(() => {
    const r = run.current;
    if (!r || r.busy || r.done >= wanted || known >= CACHE_CAPS[kind]) return;
    const asked = openRequests(r.walk);
    if (asked.length === 0) return; // every request has reached the start
    const filters = asked.map(i => (r.walk.until[i] === null ? r.filters[i] : { ...r.filters[i], until: r.walk.until[i] as number }));
    const oldest: (number | null)[] = r.filters.map(() => null);
    r.busy = true;
    const finish = (ok: boolean) => {
      r.busy = false;
      r.done += 1;
      if (ok) {
        r.walk = advanceWalk(r.walk, oldest, asked);
        if (run.current === r) saveWalk(kind, r.walk);
      }
      if (run.current === r) setTick(t => t + 1);
    };
    const sub = pool.request([...RELAYS], filters).subscribe({
      next: (event: NostrEvent) => {
        eventStore.add(event);
        filters.forEach((f, j) => {
          const i = asked[j];
          if (matchFilter(f, event)) oldest[i] = Math.min(oldest[i] ?? Infinity, event.created_at);
        });
      },
      error: (error: unknown) => { console.error(`[older] could not fetch older ${kind}:`, error); finish(false); },
      complete: () => finish(true),
    });
    return () => { if (run.current !== r) sub.unsubscribe(); };
  }, [tick, wanted, known, kind]);
}
