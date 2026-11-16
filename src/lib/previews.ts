import type { MediaItem } from './media.ts';
import type { LastVideo } from './player.ts';

// What each sticker on the board shows (spec §Home, preview table): a picture of what it would open,
// or the next item in its queue. Pure: the lists come from the same hooks the viewer plays, so "next up"
// on the board is exactly what opens. Posters only, never a video decode; with nothing to show the
// sticker draws its glyph and says so.
export interface PreviewData {
  urls: string[]; // pictures to cross-fade through
  avatars: string[]; // pubkeys, for the people stickers
  text?: string; // the next title, or a short status
  progress?: number; // 0..1, for "keep watching"
}

export interface PreviewInput {
  music: MediaItem[];
  podcasts: MediaItem[];
  radio: MediaItem[]; // the stations Radio plays next (feat-radio §RA1)
  localCount: number;
  video: MediaItem[]; // every video, newest first (what Continue opens when there is no last video)
  short: MediaItem[];
  long: MediaItem[];
  last: LastVideo | null;
  ownPictures: string[]; // the device's own picture URLs
  creators: string[]; // suggested pubkeys
}

export const SHOW = 4; // posters / avatars per sticker
export const SHOW_PICTURES = 6;

const empty = (): PreviewData => ({ urls: [], avatars: [] });

// Music / Podcasts: the cover of the next item itself, or the drawn fallback when it has none.
function nextCover(items: MediaItem[]): PreviewData {
  const next = items[0];
  return { ...empty(), urls: next?.image ? [next.image] : [], text: next?.title };
}

// Short / Long: the posters of the next videos that have one, rotating through a few. Most long videos
// (kind 1 notes with a video link) carry no poster, so looking only at the next few would show none.
function nextPosters(items: MediaItem[]): PreviewData {
  const urls = items.flatMap(i => (i.image ? [i.image] : [])).slice(0, SHOW);
  return { ...empty(), urls, text: items[0]?.title };
}

function keepWatching(last: LastVideo | null, video: MediaItem[]): PreviewData {
  if (!last) return nextPosters(video);
  const length = last.duration ?? last.item.duration;
  return {
    ...empty(),
    urls: last.item.image ? [last.item.image] : [],
    text: last.item.title,
    progress: length && length > 0 ? Math.min(1, Math.max(0, last.position / length)) : undefined,
  };
}

export function buildPreviews(input: PreviewInput): Record<string, PreviewData> {
  const { ownPictures, creators } = input;
  return {
    music: nextCover(input.music),
    podcasts: nextCover(input.podcasts),
    radio: nextCover(input.radio),
    local: { ...empty(), text: input.localCount > 0 ? `${input.localCount} tracks` : undefined },
    continue: keepWatching(input.last, input.video),
    short: nextPosters(input.short),
    long: nextPosters(input.long),
    pictures: { ...empty(), urls: ownPictures.slice(0, SHOW_PICTURES), text: ownPictures.length > 0 ? `${ownPictures.length} of yours` : undefined },
    follow: { ...empty(), avatars: creators.slice(0, SHOW), text: creators.length > 0 ? `${creators.length} to follow` : undefined },
  };
}
