import { useMemo } from 'react';
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

type ViewerRoute = Extract<Route, { page: 'viewer' }>;

export interface ViewData {
  items: MediaItem[];
  label: string;
  waiting: boolean; // still looking for who to follow / first results
  emptyText: string;
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

  const raw = useMemo((): ViewData => {
    const waiting = contacts === undefined;
    if (route.mode === 'listen') {
      if (route.filter === 'music') {
        return { items: mixMusic(audio.filter(isMusic), own.local, musicOften), label: 'Music', waiting, emptyText: 'No music from the people you follow yet.' };
      }
      if (route.filter === 'podcasts') {
        const items = sortNewest(dedupeByUrl([...own.rss, ...audio.filter(isPodcast)]));
        return { items, label: 'Podcasts', waiting: waiting && own.rss.length === 0, emptyText: 'No podcasts yet. Add an RSS feed under Your sources on the home screen.' };
      }
      return { items: own.local, label: 'Local', waiting: false, emptyText: 'No local files yet. Add a music folder under Your sources on the home screen.' };
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
        emptyText: n > 0 ? `${n} of your pictures, playing as a slideshow above.` : 'Add a folder of pictures under Your sources on the home screen; they play as a slideshow.' };
    }
    return { items: NO_ITEMS, label: 'Follow more creators', waiting: false, emptyText: '' };
  }, [route, contacts, audio, video, own.rss, own.local, own.pictures, last, musicOften]);

  return useMemo((): ViewData => {
    const { items, allPlayed } = hidePlayed(raw.items, playedAtOpen, [playingAtOpen, last?.item.id]);
    return { ...raw, items, emptyText: allPlayed ? ALL_PLAYED_TEXT : raw.emptyText };
  }, [raw, playedAtOpen, playingAtOpen, last]);
}
