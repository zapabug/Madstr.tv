import { useMemo } from 'react';
import { dedupeByUrl, isPodcast, sortNewest, type MediaItem } from '../lib/media.ts';
import { loadLastVideo } from '../lib/player.ts';
import type { Route } from '../lib/route.ts';
import { useOwn } from './ownContext.ts';
import { useContacts, useNostrItems } from './nostr.ts';
import { useFeedPubkey } from './people.ts';
import { useLiked } from '../lib/liked.ts';
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
  const liked = useLiked();
  const tags = useTagSet();
  const isLiked = route.mode === 'people' && route.filter === 'liked';

  const wantsAudio = route.mode === 'listen' && route.filter !== 'local';
  const wantsVideo = route.mode === 'watch';
  // Liked: everything the liked people posted, audio and video together.
  const likedAudio = useNostrItems('audio', isLiked ? liked : undefined);
  const likedVideo = useNostrItems('video', isLiked ? liked : undefined);
  const audio = useNostrItems('audio', wantsAudio ? contacts : undefined, wantsAudio ? tags.audio : []);
  const video = useNostrItems('video', wantsVideo ? contacts : undefined, wantsVideo ? tags.video : []);
  const last = useMemo(() => loadLastVideo(), []);

  return useMemo((): ViewData => {
    const waiting = contacts === undefined;
    if (route.mode === 'listen') {
      if (route.filter === 'music') {
        return { items: audio.filter(i => !isPodcast(i)), label: 'Music', waiting, emptyText: 'No music from the people you follow yet.' };
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
      return { items: NO_ITEMS, label: 'My pictures', waiting: false, emptyText: 'Add a folder of pictures under Your sources on the home screen; they play as a slideshow.' };
    }
    if (route.filter === 'liked') {
      const items = sortNewest(dedupeByUrl([...likedAudio, ...likedVideo]));
      return { items, label: 'Liked npubs', waiting: false, emptyText: liked.length === 0 ? 'Like a creator and their posts show up here.' : 'Nothing from your liked people yet.' };
    }
    return { items: NO_ITEMS, label: 'Follow more creators', waiting: false, emptyText: '' };
  }, [route, contacts, audio, video, own.rss, own.local, last, likedAudio, likedVideo, liked]);
}
