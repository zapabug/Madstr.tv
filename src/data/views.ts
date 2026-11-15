import { useMemo } from 'react';
import { dedupeByUrl, isPodcast, sortNewest, type MediaItem } from '../lib/media.ts';
import { loadLastVideo } from '../lib/player.ts';
import type { Route } from '../lib/route.ts';
import { useOwn } from './ownContext.ts';
import { TV_PUBKEY, useContacts, useNostrItems } from './nostr.ts';

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
  const contacts = useContacts(TV_PUBKEY);

  const wantsAudio = route.mode === 'listen' && route.filter !== 'local';
  const wantsVideo = route.mode === 'watch';
  const audio = useNostrItems('audio', wantsAudio ? contacts : undefined);
  const video = useNostrItems('video', wantsVideo ? contacts : undefined);
  const last = useMemo(() => loadLastVideo(), []);

  return useMemo((): ViewData => {
    const waiting = contacts === undefined;
    if (route.mode === 'listen') {
      if (route.filter === 'music') {
        return { items: audio.filter(i => !isPodcast(i)), label: 'Music', waiting, emptyText: 'No music from the people you follow yet.' };
      }
      if (route.filter === 'podcasts') {
        const items = sortNewest(dedupeByUrl([...own.rss, ...audio.filter(isPodcast)]));
        return { items, label: 'Podcasts', waiting: waiting && own.rss.length === 0, emptyText: 'No podcasts yet. Add an RSS feed below.' };
      }
      return { items: own.local, label: 'Local', waiting: false, emptyText: 'No local files yet. Add a folder below.' };
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
      return { items: NO_ITEMS, label: 'My pictures', waiting: false, emptyText: 'Local pictures arrive in a later step.' };
    }
    return { items: NO_ITEMS, label: route.filter === 'liked' ? 'Liked npubs' : 'Follow more creators', waiting: false, emptyText: 'People arrive in a later step.' };
  }, [route, contacts, audio, video, own.rss, own.local, last]);
}
