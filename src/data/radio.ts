import { useEffect, useMemo, useState } from 'react';
import { onlyEvents } from 'applesauce-relay';
import { use$ } from 'applesauce-react/hooks';
import type { Filter, NostrEvent } from 'applesauce-core/helpers';
import { RELAYS, eventStore, pool } from '../lib/applesauce.ts';
import type { MediaItem } from '../lib/media.ts';
import { LIVE_KIND, MAX_LOADED, PAGE, RADIO_RELAY, STATION_KIND, liveFromEvent, perWord, stationFromEvent, takeTurns } from '../lib/radio.ts';
import { unlimited, useRelayFeed } from './nostr.ts';

// Where Radio's stations and live shows come from (feat-radio §RA2, §RA3b). Nothing waits on a relay: the lists
// fill as events arrive, and the device cache puts the stations seen before back in at once.

export const STATION_RELAYS: readonly string[] = [...new Set([RADIO_RELAY, ...RELAYS])];
export const LIVE_RELAYS: readonly string[] = [...new Set(['wss://relay.zap.stream', ...RELAYS])];

const stations = new WeakMap<NostrEvent, MediaItem | null>();
function asStation(event: NostrEvent): MediaItem | null {
  let item = stations.get(event);
  if (item === undefined) { item = stationFromEvent(event); stations.set(event, item); }
  return item;
}

function useStationEvents(filters: Filter[], key: string): MediaItem[] {
  useRelayFeed(filters, key, STATION_RELAYS);
  const events = use$(() => (filters.length > 0 ? eventStore.timeline(unlimited(filters)) : undefined), [key]);
  return useMemo(() => (events ?? []).map(asStation).filter((s): s is MediaItem => s !== null), [events]);
}

/** The stations for the words that are on (spec RA5): each word as a genre (`#c`, every station relay; the device
 *  cache answers at once) and as a text search of names and descriptions (NIP-50, only the station relay). Each
 *  word asks for its share of 300; the genre answers come first, then the search answers, at most 300 in all. */
export function useWordStations(words: readonly string[]): MediaItem[] {
  const key = words.join('|');
  const per = perWord(words.length);
  const genreFilters = useMemo<Filter[]>(() => words.map(w => ({ kinds: [STATION_KIND], '#c': [w], limit: per })),
    // words is represented by key
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, per]);
  const byGenre = useStationEvents(genreFilters, `stations:words:${key}`);

  // The store cannot answer a text search, so what the relay sends back for each word is kept here.
  const [found, setFound] = useState<{ key: string; byWord: Record<string, NostrEvent[]> }>({ key: '', byWord: {} });
  useEffect(() => {
    if (words.length === 0) return;
    const got: Record<string, NostrEvent[]> = {};
    const subs = words.map(w => pool.subscription([RADIO_RELAY], [{ kinds: [STATION_KIND], search: w, limit: per }]).pipe(onlyEvents()).subscribe({
      next: event => {
        eventStore.add(event);
        (got[w] ??= []).push(event);
        setFound({ key, byWord: { ...got } });
      },
      error: error => { console.error('[radio] search failed:', error); },
    }));
    return () => subs.forEach(s => s.unsubscribe());
    // words is represented by key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, per]);

  return useMemo(() => {
    const searched = found.key === key ? found.byWord : {};
    // Per word: its genre answers, then its search answers; the words take turns (radioQueue keeps 300).
    const lists = words.map(w => [
      ...byGenre.filter(s => s.genres?.includes(w)),
      ...(searched[w] ?? []).map(asStation).filter((s): s is MediaItem => s !== null),
    ]);
    return takeTurns(lists).slice(0, MAX_LOADED * 2);
    // words is represented by key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byGenre, found, key]);
}

/** The newest stations: where the genre picker's list comes from (one page of 500), and what All genres plays
 *  (300, spec RA5). */
export function useRecentStations(enabled: boolean, limit: number = PAGE): MediaItem[] {
  const filters = useMemo<Filter[]>(() => (enabled ? [{ kinds: [STATION_KIND], limit }] : []), [enabled, limit]);
  return useStationEvents(filters, `stations:recent:${enabled}:${limit}`);
}

// Live now changes with the clock (a show not updated for an hour has ended), so it is read again every minute.
function useMinute(): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

const LIVE_FILTERS: Filter[] = [{ kinds: [LIVE_KIND], limit: 200 }];

/** Live shows that can play now (the relays do not all filter on `status`, so it is checked here). */
export function useLiveNow(enabled: boolean): MediaItem[] {
  const filters = enabled ? LIVE_FILTERS : [];
  useRelayFeed(filters, `live:${enabled}`, LIVE_RELAYS);
  const events = use$(() => (enabled ? eventStore.timeline(unlimited(LIVE_FILTERS)) : undefined), [enabled]);
  const now = useMinute();
  return useMemo(() => (events ?? []).map(e => liveFromEvent(e, now)).filter((s): s is MediaItem => s !== null), [events, now]);
}
