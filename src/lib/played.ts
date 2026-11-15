import type { MediaItem } from './media.ts';
import { createSessionSet } from './sessionSet.ts';

// What has played in this session (spec §Added later, "Played items hide for the session"). The player marks
// an item once it has played and you move on from it, or it ends.
export const played = createSessionSet('madstr:played', 5000);

// A playlist as it opens: what has played this session left out, except the ids in `keep` (the item
// playing right now, Keep watching's resume video). `allPlayed` tells "everything here has played" apart
// from "nothing here yet".
export function hidePlayed(items: MediaItem[], playedIds: ReadonlySet<string>, keep: readonly (string | undefined)[] = []): { items: MediaItem[]; allPlayed: boolean } {
  if (playedIds.size === 0) return { items, allPlayed: false };
  const kept = new Set(keep.filter((k): k is string => !!k));
  const out = items.filter(i => kept.has(i.id) || !playedIds.has(i.id));
  return { items: out, allPlayed: items.length > 0 && out.length === 0 };
}

export const ALL_PLAYED_TEXT = 'Everything here has played this session.';
