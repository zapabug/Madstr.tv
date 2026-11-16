import { useMemo, useSyncExternalStore } from 'react';
import { isMusic, isPodcast } from '../lib/media.ts';
import { useProbedDurations } from '../lib/durations.ts';
import { useTagSet } from '../lib/tags.ts';
import { loadLastVideo, player } from '../lib/player.ts';
import { useSavedStations } from './radioStore.ts';
import { buildPreviews, type PreviewData } from '../lib/previews.ts';
import { hidePlayed, played } from '../lib/played.ts';
import { applyTaste, useTaste } from '../lib/taste.ts';
import type { MediaItem } from '../lib/media.ts';
import { useOwn } from './ownContext.ts';
import { useContacts, useNostrItems } from './nostr.ts';
import { useCreatorSuggestions, useFeedPubkey } from './people.ts';

export type { PreviewData };

// What Radio plays next: the rest of its queue while Radio is the player's playlist, else Your stations
// (feat-radio §RA1). Read by a key, so the board does not re-render on every position tick.
const radioKey = () => { const s = player.getSnapshot(); return s.label === 'Radio' ? `${s.index}:${s.queue.length}:${s.queue[s.index + 1]?.id ?? ''}` : ''; };
function useRadioNext(): MediaItem[] {
  const key = useSyncExternalStore(player.subscribe, radioKey, radioKey);
  const saved = useSavedStations();
  return useMemo(() => {
    const s = player.getSnapshot();
    return key ? s.queue.slice(s.index + 1) : saved;
    // key stands for the player's Radio queue
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, saved]);
}

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
  // The previews follow the lists they open, so what has played this session is left out here too.
  const playedAtOpen = useMemo(() => played.snapshot(), []);
  const taste = useTaste();
  const radio = useRadioNext();

  return useMemo(() => {
    const fresh = (items: MediaItem[]) => hidePlayed(applyTaste(items, taste), playedAtOpen, [last?.item.id]).items;
    const unplayedVideo = fresh(video);
    return buildPreviews({
    music: fresh(audio.filter(isMusic)),
    podcasts: fresh([...own.rss, ...audio.filter(isPodcast)]),
    radio: applyTaste(radio, taste),
    localCount: fresh(own.local).length,
    video: unplayedVideo,
    short: unplayedVideo.filter(v => v.short),
    long: unplayedVideo.filter(v => !v.short),
    last,
    ownPictures: own.pictures.map(p => p.url),
    creators: creators.map(c => c.pubkey),
    });
  }, [audio, video, own.rss, own.local, own.pictures, creators, last, playedAtOpen, taste, radio]);
}
