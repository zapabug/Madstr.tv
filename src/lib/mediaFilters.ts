import type { Filter } from 'applesauce-core/helpers';

// The relay filters for one kind of media from a set of authors and/or hashtags. Plain notes (kind 1) are
// most of what anyone posts, so they would crowd the rare media kinds out of a shared limit: the media kinds
// are asked for on their own, notes separately. `until` asks for what is older than that time (seconds),
// which is how the picture cache reaches back in time (spec §Added later).
export const PER_CHUNK_LIMIT = 300;
export const NOTES_LIMIT = 200;
export const AUTHORS_PER_FILTER = 100;

export function chunk<T>(list: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export function mediaFilters(kinds: readonly number[], authors: readonly string[], hashtags: readonly string[], until?: number): Filter[] {
  const rare = kinds.filter(k => k !== 1);
  const older = until !== undefined ? { until } : {};
  const out: Filter[] = [];
  for (const group of chunk(authors, AUTHORS_PER_FILTER)) {
    if (rare.length > 0) out.push({ kinds: rare, authors: group, limit: PER_CHUNK_LIMIT, ...older });
    if (kinds.includes(1)) out.push({ kinds: [1], authors: group, limit: NOTES_LIMIT, ...older });
  }
  if (hashtags.length > 0) out.push({ kinds: [...kinds], '#t': [...hashtags], limit: PER_CHUNK_LIMIT, ...older });
  return out;
}
