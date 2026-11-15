import { useMemo } from 'react';
import { isPodcast, type MediaItem } from '../lib/media.ts';
import { useLiked } from '../lib/liked.ts';
import { loadLastVideo } from '../lib/player.ts';
import { useOwn } from './ownContext.ts';
import { useContacts, useNostrItems } from './nostr.ts';
import { useCreatorSuggestions, useFeedPubkey } from './people.ts';

// What each sticker on the board shows: a picture of what it would open (cover art, a
// poster, a slide) or the next item in its queue. Everything comes from the same lists
// the viewer plays, so "next up" on the board is exactly what opens. Nothing is invented:
// with no source yet a sticker says so.
export interface PreviewData {
  urls: string[]; // pictures to rotate through
  frame?: string; // a video with no poster: show its first frame
  avatars: string[]; // pubkeys, for the people stickers
  text?: string; // the next title, or a short status
  progress?: number; // 0..1, for "keep watching"
}

const SHOW = 4;
const picturesOf = (items: MediaItem[]): string[] => items.filter(i => i.image).slice(0, SHOW).map(i => i.image as string);

export function usePreviews(): Record<string, PreviewData> {
  const own = useOwn();
  const feed = useFeedPubkey();
  const contacts = useContacts(feed);
  const audio = useNostrItems('audio', contacts);
  const video = useNostrItems('video', contacts);
  const images = useNostrItems('image', contacts);
  const liked = useLiked();
  const { creators } = useCreatorSuggestions();
  const last = useMemo(() => loadLastVideo(), []);

  return useMemo(() => {
    const music = audio.filter(i => !isPodcast(i));
    const podcasts = [...own.rss, ...audio.filter(isPodcast)];
    const short = video.filter(v => v.short);
    const long = video.filter(v => !v.short);
    const empty: PreviewData = { urls: [], avatars: [] };
    const fromVideos = (items: MediaItem[]): PreviewData => {
      const posters = picturesOf(items);
      const first = items[0];
      return { ...empty, urls: posters, frame: posters.length === 0 ? first?.url : undefined, text: first?.title };
    };
    return {
      music: { ...empty, urls: picturesOf(music), text: music[0]?.title },
      podcasts: { ...empty, urls: picturesOf(podcasts), text: podcasts[0]?.title },
      local: { ...empty, text: own.local.length > 0 ? `${own.local.length} tracks` : undefined },
      continue: last
        ? { ...empty, urls: last.item.image ? [last.item.image] : [], frame: last.item.image ? undefined : last.item.url, text: last.item.title,
            progress: last.item.duration ? Math.min(1, last.position / last.item.duration) : undefined }
        : fromVideos(video),
      short: fromVideos(short),
      long: fromVideos(long),
      pictures: { ...empty, urls: [...own.pictures, ...images].slice(0, 6).map(i => i.url), text: own.pictures.length > 0 ? `${own.pictures.length} of yours` : undefined },
      liked: { ...empty, avatars: liked.slice(0, SHOW), text: liked.length > 0 ? `${liked.length} liked` : undefined },
      follow: { ...empty, avatars: creators.slice(0, SHOW).map(c => c.pubkey), text: creators.length > 0 ? `${creators.length} to follow` : undefined },
    } satisfies Record<string, PreviewData>;
  }, [audio, video, images, own.rss, own.local, own.pictures, liked, creators, last]);
}
