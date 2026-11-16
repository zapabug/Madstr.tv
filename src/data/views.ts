import { useMemo, useSyncExternalStore } from 'react';
import { dedupeByUrl, isMusic, isPodcast, sortNewest, type MediaItem } from '../lib/media.ts';
import { mixMusic, useMusicMix } from '../lib/musicMix.ts';
import { loadLastVideo, player } from '../lib/player.ts';
import { ALL_PLAYED_TEXT, hidePlayed, played } from '../lib/played.ts';
import type { Route } from '../lib/route.ts';
import { useOwn } from './ownContext.ts';
import { useContacts, useNostrItems } from './nostr.ts';
import { useFeedPubkey } from './people.ts';
import { useProbedDurations } from '../lib/durations.ts';
import { useTagSet } from '../lib/tags.ts';
import { applyTaste, useTaste } from '../lib/taste.ts';
import { useOlderMedia } from './older.ts';
import { useFollowedStations, useGenreStations, useLiveNow } from './radio.ts';
import { useRadioPrefs, useSavedStations } from './radioStore.ts';
import { radioQueue } from '../lib/radio.ts';

type ViewerRoute = Extract<Route, { page: 'viewer' }>;

export interface ViewData {
  items: MediaItem[];
  label: string;
  waiting: boolean; // still looking for who to follow / first results
  emptyText: string;
  listKey?: string; // changes when the same view opens another list (Radio's stickers and country)
  startAt?: number; // where that list starts playing; -1 = not here yet (keep playing what plays)
}

// The item playing, by id only (re-renders when the track changes, not on every position tick).
const currentId = () => player.current?.id;
function usePlayingId(): string | undefined {
  return useSyncExternalStore(player.subscribe, currentId, currentId);
}

const NO_ITEMS: MediaItem[] = [];

// What a sticker opens: the list of items for a mode + filter. Each branch asks only for
// what it needs, so Music does not subscribe to videos and the other way round.
export function useViewItems(route: ViewerRoute): ViewData {
  const own = useOwn();
  const feed = useFeedPubkey();
  const contacts = useContacts(feed);
  const tags = useTagSet();

  const wantsAudio = route.mode === 'listen' && route.filter !== 'local';
  const wantsVideo = route.mode === 'watch';
  const audio = useProbedDurations(useNostrItems('audio', wantsAudio ? contacts : undefined, wantsAudio ? tags.audio : []));
  const video = useNostrItems('video', wantsVideo ? contacts : undefined, wantsVideo ? tags.video : []);
  const last = useMemo(() => loadLastVideo(), []);
  // What has played this session, as it was when this view opened: inside one visit nothing disappears.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const playedAtOpen = useMemo(() => played.snapshot(), [route.mode, route.filter]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const playingAtOpen = useMemo(() => player.current?.id, [route.mode, route.filter]);

  const musicOften = useMusicMix();
  const taste = useTaste();

  // Radio (feat-radio §RA2, §RA3b): Live now, your follows' stations, and the open sticker's stations.
  const wantsRadio = route.mode === 'listen' && route.filter === 'radio';
  const radioPrefs = useRadioPrefs();
  const saved = useSavedStations();
  const genre = wantsRadio && radioPrefs.sticker !== 'yours' ? radioPrefs.sticker : undefined;
  const genreStations = useGenreStations(genre);
  const followedStations = useFollowedStations(wantsRadio ? contacts : undefined);
  const liveNow = useLiveNow(wantsRadio);

  const raw = useMemo((): ViewData => {
    const waiting = contacts === undefined;
    if (route.mode === 'listen') {
      if (route.filter === 'music') {
        return { items: mixMusic(audio.filter(isMusic), own.local, musicOften), label: 'Music', waiting, emptyText: 'No music from the people you follow yet.' };
      }
      if (route.filter === 'radio') {
        const items = radioQueue({
          live: liveNow, followed: followedStations, follows: new Set(contacts ?? []),
          stations: genre ? genreStations : saved, country: radioPrefs.country,
        });
        const where = radioPrefs.country ? ` in ${radioPrefs.country}` : '';
        const emptyText = genre ? `No ${genre} stations${where} yet.`
          : saved.length > 0 && where ? `None of your stations is${where}.`
          : 'No stations saved yet. Pick a genre sticker and up vote the stations you like.';
        // A sticker you press plays its own first station (Live now stays at the top of the list).
        const own = new Set((genre ? genreStations : saved).map(s => s.id));
        const first = items.findIndex(i => own.has(i.id));
        const startAt = first >= 0 ? first : genre ? -1 : 0;
        return { items, label: 'Radio', waiting: genre !== undefined && genreStations.length === 0, emptyText, listKey: `${radioPrefs.sticker}|${radioPrefs.country}`, startAt };
      }
      if (route.filter === 'podcasts') {
        const items = sortNewest(dedupeByUrl([...own.rss, ...audio.filter(isPodcast)]));
        return { items, label: 'Podcasts', waiting: waiting && own.rss.length === 0, emptyText: 'No podcasts yet. Add an RSS feed under Make it yours.' };
      }
      return { items: own.local, label: 'Local', waiting: false, emptyText: 'No local files yet. Add a music folder under Make it yours.' };
    }
    if (route.mode === 'watch') {
      if (route.filter === 'short') {
        return { items: video.filter(v => v.short), label: 'Short videos', waiting, emptyText: 'No short videos yet.' };
      }
      if (route.filter === 'long') {
        return { items: video.filter(v => !v.short), label: 'Long videos', waiting, emptyText: 'No long videos yet.' };
      }
      // Keep watching: the last video first (at its saved spot), then everything newest.
      const rest = video.filter(v => v.id !== last?.item.id);
      return { items: last ? [last.item, ...rest] : video, label: 'Keep watching', waiting: waiting && !last, emptyText: 'Nothing watched yet.' };
    }
    if (route.mode === 'pictures') {
      const n = own.pictures.length;
      return { items: NO_ITEMS, label: 'My pictures', waiting: false,
        emptyText: n > 0 ? `${n} of your pictures, playing as a slideshow above.` : 'Add a folder of pictures under Make it yours; they play as a slideshow.' };
    }
    return { items: NO_ITEMS, label: route.filter === 'sources' ? 'Make it yours' : 'Follow more creators', waiting: false, emptyText: '' };
  }, [route, contacts, audio, video, own.rss, own.local, own.pictures, last, musicOften, liveNow, followedStations, genre, genreStations, saved, radioPrefs.country, radioPrefs.sticker]);

  const view = useMemo((): ViewData => {
    // Your taste first (hidden songs and artists out, down votes last; spec feat-taste-cache §T2), then played.
    const { items, allPlayed } = hidePlayed(applyTaste(raw.items, taste), playedAtOpen, [playingAtOpen, last?.item.id]);
    return { ...raw, items, emptyText: allPlayed ? ALL_PLAYED_TEXT : raw.emptyText };
  }, [raw, playedAtOpen, playingAtOpen, last, taste]);

  // Reach back for older items: one batch on opening, one more per 30 the list drops (spec feat-taste-cache
  // §T4). Dropped = hidden, played this session (counted live, as the music plays on), and for Music the
  // tracks under 2 minutes.
  const playingId = usePlayingId();
  const dropped = useMemo(() => {
    if (!wantsAudio && !wantsVideo) return 0;
    const playedNow = played.snapshot();
    const tasteKept = new Set(applyTaste(raw.items, taste).map(i => i.id));
    let n = 0;
    for (const item of raw.items) if (!tasteKept.has(item.id) || (playedNow.has(item.id) && item.id !== playingId)) n += 1;
    if (route.mode === 'listen' && route.filter === 'music') n += audio.filter(i => !isPodcast(i) && !isMusic(i)).length;
    return n;
  }, [raw, taste, playingId, audio, route.mode, route.filter, wantsAudio, wantsVideo]);
  useOlderMedia('audio', wantsAudio ? contacts : undefined, wantsAudio ? tags.audio : [], dropped, audio.length);
  useOlderMedia('video', wantsVideo ? contacts : undefined, wantsVideo ? tags.video : [], dropped, video.length);

  return view;
}
