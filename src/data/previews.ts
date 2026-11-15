import { useMemo } from 'react';
import { isPodcast } from '../lib/media.ts';
import { useProbedDurations } from '../lib/durations.ts';
import { useTagSet } from '../lib/tags.ts';
import { loadLastVideo } from '../lib/player.ts';
import { buildPreviews, type PreviewData } from '../lib/previews.ts';
import { useOwn } from './ownContext.ts';
import { useContacts, useNostrItems } from './nostr.ts';
import { useCreatorSuggestions, useFeedPubkey } from './people.ts';

export type { PreviewData };

// The board's sticker previews, fed by the same lists the viewer plays. The rules are in lib/previews.ts.
export function usePreviews(): Record<string, PreviewData> {
  const own = useOwn();
  const feed = useFeedPubkey();
  const contacts = useContacts(feed);
  const tags = useTagSet();
  const audio = useProbedDurations(useNostrItems('audio', contacts, tags.audio));
  const video = useNostrItems('video', contacts, tags.video);
  const { creators } = useCreatorSuggestions();
  const last = useMemo(() => loadLastVideo(), []);

  return useMemo(() => buildPreviews({
    music: audio.filter(i => !isPodcast(i)),
    podcasts: [...own.rss, ...audio.filter(isPodcast)],
    localCount: own.local.length,
    video,
    short: video.filter(v => v.short),
    long: video.filter(v => !v.short),
    last,
    ownPictures: own.pictures.map(p => p.url),
    creators: creators.map(c => c.pubkey),
  }), [audio, video, own.rss, own.local, own.pictures, creators, last]);
}
