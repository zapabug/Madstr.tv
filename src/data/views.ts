import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
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
import { DROPS_PER_BATCH } from '../lib/walk.ts';
import { useLiveNow, useRecentStations, useWordStations } from './radio.ts';
import { useRadioPrefs, useSavedStations } from './radioStore.ts';
import { MAX_LOADED, PAGE_SHOWN, hasSelection, liveMatches, radioQueue, shownCount } from '../lib/radio.ts';

type ViewerRoute = Extract<Route, { page: 'viewer' }>;

export interface ViewData {
  items: MediaItem[];
  label: string;
  waiting: boolean; // still looking for who to follow / first results
  emptyText: string;
  listKey?: string; // changes when the same view opens another list (Radio's selection)
  more?: { left: number; load: () => void }; // Radio plays 30 at a time (feat-radio §RA5)
}

// The item playing, by id only (re-renders when the track changes, not on every position tick).
const currentId = () => player.current?.id;
function usePlayingId(): string | undefined {
  return useSyncExternalStore(player.subscribe, currentId, currentId);
}

const NO_ITEMS: MediaItem[] = [];
const NO_WORDS: string[] = [];
const PODCASTS_WANTED = 30;
const MAX_PODCAST_BATCHES = 50;
const radioAtEnd = () => { const s = player.getSnapshot(); return s.label === 'Radio' && s.queue.length > 0 && s.index === s.queue.length - 1; };

// What a sticker opens: the list of items for a mode + filter. Each branch asks only for
// what it needs, so Music does not subscribe to videos and the other way round.
export function useViewItems(route: ViewerRoute): ViewData {
  const own = useOwn();
  const feed = useFeedPubkey();
  const contacts = useContacts(feed);
  const tags = useTagSet();

  const wantsAudio = route.mode === 'listen' && route.filter !== 'local';
  const wantsVideo = route.mode === 'watch';
  const audio = useProbedDurations(useNostrItems('audio', wantsAudio ? contacts : undefined, wantsAudio ? tags.audio : []), wantsAudio);
  const video = useNostrItems('video', wantsVideo ? contacts : undefined, wantsVideo ? tags.video : []);
  const last = useMemo(() => loadLastVideo(), []);
  // What has played this session, as it was when this view opened: inside one visit nothing disappears.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const playedAtOpen = useMemo(() => played.snapshot(), [route.mode, route.filter]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const playingAtOpen = useMemo(() => player.current?.id, [route.mode, route.filter]);

  const musicOften = useMusicMix();
  const taste = useTaste();

  // Radio (feat-radio §RA5): nothing until you select; the words that are on (as genres and as a search), or All
  // genres; Your stations; the live shows tagged with a word; filtered by the countries that are on.
  const wantsRadio = route.mode === 'listen' && route.filter === 'radio';
  const radioPrefs = useRadioPrefs();
  const saved = useSavedStations();
  const words = wantsRadio && !radioPrefs.allGenres ? radioPrefs.on : NO_WORDS;
  const wordStations = useWordStations(words);
  const allStations = useRecentStations(wantsRadio && radioPrefs.allGenres, MAX_LOADED);
  const liveNow = useLiveNow(wantsRadio);
  const radioKey = JSON.stringify([radioPrefs.allGenres, radioPrefs.yours, radioPrefs.on, radioPrefs.countriesOn]);
  const [radioPages, setRadioPages] = useState({ key: '', pages: 1 });
  const pages = radioPages.key === radioKey ? radioPages.pages : 1;

  const raw = useMemo((): ViewData => {
    const waiting = contacts === undefined;
    if (route.mode === 'listen') {
      if (route.filter === 'music') {
        return { items: mixMusic(audio.filter(isMusic), own.local, musicOften), label: 'Music', waiting, emptyText: 'No music from the people you follow yet.' };
      }
      if (route.filter === 'radio') {
        if (!hasSelection(radioPrefs)) {
          return { items: NO_ITEMS, label: 'Radio', waiting: false, emptyText: 'Pick a genre, a word like bitcoin, or Your stations.', listKey: radioKey };
        }
        const items = radioQueue({
          live: liveNow.filter(l => liveMatches(l, words, radioPrefs.allGenres)),
          stations: [...(radioPrefs.yours ? saved : []), ...(radioPrefs.allGenres ? allStations : wordStations)],
          follows: new Set(contacts ?? []),
          countries: radioPrefs.countriesOn,
        });
        const searching = radioPrefs.allGenres ? allStations.length === 0 : words.length > 0 && wordStations.length === 0;
        return { items, label: 'Radio', waiting: searching, emptyText: 'No stations for this choice yet. Try another genre or country.', listKey: radioKey };
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
  }, [route, contacts, audio, video, own.rss, own.local, own.pictures, last, musicOften, liveNow, words, wordStations, allStations, saved, radioPrefs, radioKey]);

  const view = useMemo((): ViewData => {
    // Your taste first (hidden songs and artists out, down votes last; spec feat-taste-cache §T2), then played.
    const { items, allPlayed } = hidePlayed(applyTaste(raw.items, taste), playedAtOpen, [playingAtOpen, last?.item.id]);
    if (wantsRadio) {
      // 30 at a time (feat-radio §RA5): the playlist holds the first pages; +30 more, or the last one playing, adds one.
      const shown = shownCount(items.length, pages);
      const load = () => setRadioPages({ key: radioKey, pages: pages + 1 });
      return { ...raw, items: items.slice(0, shown), more: shown < items.length ? { left: Math.min(PAGE_SHOWN, items.length - shown), load } : undefined };
    }
    return { ...raw, items, emptyText: allPlayed ? ALL_PLAYED_TEXT : raw.emptyText };
  }, [raw, playedAtOpen, playingAtOpen, last, taste, wantsRadio, pages, radioKey]);

  // The playlist's last item is playing (in shuffled order too): the next 30 join.
  const atEnd = useSyncExternalStore(player.subscribe, radioAtEnd, radioAtEnd);
  const more = view.more;
  const shownNow = view.items.length;
  useEffect(() => {
    // Only once the player holds what is shown: otherwise one end would load twice before the queue catches up.
    if (wantsRadio && more && atEnd && player.getSnapshot().queue.length === shownNow) more.load();
  }, [wantsRadio, more, atEnd, shownNow]);

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
    // Podcasts are a small part of the audio on Nostr: the music the Podcasts list leaves out counts as dropped
    // too, so the walk reaches back for older episodes (spec feat-taste-cache §T4, "podcasts longer").
    if (route.mode === 'listen' && route.filter === 'podcasts') {
      n += audio.filter(i => !isPodcast(i)).length;
      // Audio is rare among notes, so a batch may bring hardly any: under 30 episodes, keep reaching back until the
      // relays have nothing older or the device cache is full (zapa, 2026-11-17).
      if (raw.items.length < PODCASTS_WANTED) n += DROPS_PER_BATCH * MAX_PODCAST_BATCHES;
    }
    return n;
  }, [raw, taste, playingId, audio, route.mode, route.filter, wantsAudio, wantsVideo]);
  useOlderMedia('audio', wantsAudio ? contacts : undefined, wantsAudio ? tags.audio : [], dropped, audio.length);
  useOlderMedia('video', wantsVideo ? contacts : undefined, wantsVideo ? tags.video : [], dropped, video.length);

  return view;
}
