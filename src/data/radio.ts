import { useEffect, useMemo, useState } from 'react';
import { use$ } from 'applesauce-react/hooks';
import type { Filter, NostrEvent } from 'applesauce-core/helpers';
import { RELAYS, eventStore } from '../lib/applesauce.ts';
import type { MediaItem } from '../lib/media.ts';
import { chunk } from '../lib/mediaFilters.ts';
import { LIVE_KIND, PAGE, RADIO_RELAY, STATION_KIND, liveFromEvent, stationFromEvent } from '../lib/radio.ts';
import { unlimited, useRelayFeed } from './nostr.ts';

// Where Radio's stations and live shows come from (feat-radio §RA2, §RA3b). Nothing waits on a relay: the lists
// fill as events arrive, and the device cache puts the stations seen before back in at once.

export const STATION_RELAYS: readonly string[] = [...new Set([RADIO_RELAY, ...RELAYS])];
export const LIVE_RELAYS: readonly string[] = [...new Set(['wss://relay.zap.stream', ...RELAYS])];
const AUTHORS_PER_FILTER = 100;

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

/** One genre's stations, newest first (one page of up to 500). */
export function useGenreStations(genre: string | undefined): MediaItem[] {
  const filters = useMemo<Filter[]>(() => (genre ? [{ kinds: [STATION_KIND], '#c': [genre], limit: PAGE }] : []), [genre]);
  return useStationEvents(filters, `stations:genre:${genre ?? ''}`);
}

/** The newest stations (one page): where the genre picker's list comes from. */
export function useRecentStations(enabled: boolean): MediaItem[] {
  const filters = useMemo<Filter[]>(() => (enabled ? [{ kinds: [STATION_KIND], limit: PAGE }] : []), [enabled]);
  return useStationEvents(filters, `stations:recent:${enabled}`);
}

/** Stations posted by people you follow. */
export function useFollowedStations(follows: string[] | undefined): MediaItem[] {
  const key = follows ? follows.join(',') : '';
  const filters = useMemo<Filter[]>(
    () => chunk(follows ?? [], AUTHORS_PER_FILTER).map(authors => ({ kinds: [STATION_KIND], authors, limit: PAGE })),
    // follows is represented by key
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  return useStationEvents(filters, `stations:follows:${key}`);
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
