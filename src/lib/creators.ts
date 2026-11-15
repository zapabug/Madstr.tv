import { isPodcast, type MediaItem } from './media.ts';

// What a creator publishes, in the five kinds zapa wants people ranked by.
export type Category = 'images' | 'videos' | 'podcasts' | 'music' | 'shorts';

export const CATEGORIES: readonly { id: Category; label: string; emoji: string; hint: string }[] = [
  { id: 'images', label: 'Images', emoji: '\u{1F5BC}\uFE0F', hint: 'pictures' },
  { id: 'videos', label: 'Videos', emoji: '\u{1F3AC}', hint: 'videos of 30 seconds or more' },
  { id: 'podcasts', label: 'Podcasts', emoji: '\u{1F399}\uFE0F', hint: 'audio longer than 9 minutes' },
  { id: 'music', label: 'Music', emoji: '\u{1F3B5}', hint: 'audio of 9 minutes or less' },
  { id: 'shorts', label: 'Short videos', emoji: '\u26A1', hint: 'videos under 30 seconds' },
];

export function categoryOf(item: MediaItem): Category {
  if (item.kind === 'image') return 'images';
  if (item.kind === 'video') return item.short ? 'shorts' : 'videos';
  return isPodcast(item) ? 'podcasts' : 'music';
}

export interface Creator {
  pubkey: string;
  counts: Record<Category, number>;
  total: number; // everything they published that was found
  latest: string; // title of their newest item
  latestAt: number;
  mutual: number; // how many of your follows follow them (0 = not a friend of a follow)
}

const emptyCounts = (): Record<Category, number> => ({ images: 0, videos: 0, podcasts: 0, music: 0, shorts: 0 });

// "Friends of follows": count, for everyone the people you follow also follow, how many of those lists
// they appear in. Each list counts a person once; people you already follow (and yourself) are left
// out. Most-followed-by-your-follows first, capped.
export function friendsOfFollows(lists: ReadonlyArray<readonly string[]>, exclude: ReadonlySet<string>, max = 400): Map<string, number> {
  const counts = new Map<string, number>();
  for (const list of lists) {
    for (const pubkey of new Set(list)) {
      if (!exclude.has(pubkey)) counts.set(pubkey, (counts.get(pubkey) ?? 0) + 1);
    }
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, max);
  return new Map(top);
}

// "Follow more creators": who publishes what, that you do not follow yet. Friends of your follows come
// first as a group, then everyone else; inside each group, the most prolific leads. Pick one category and
// only people who publish it are shown, ranked by how much of it they publish. Built only from items that
// really came from relays.
export function rankCreators(
  items: MediaItem[], exclude: ReadonlySet<string>, max = 30, mutual: ReadonlyMap<string, number> = new Map(), category: Category | 'all' = 'all',
): Creator[] {
  const by = new Map<string, Creator>();
  for (const item of items) {
    const pubkey = item.pubkey;
    if (!pubkey || exclude.has(pubkey)) continue;
    let creator = by.get(pubkey);
    if (!creator) {
      creator = { pubkey, counts: emptyCounts(), total: 0, latest: item.title, latestAt: item.createdAt, mutual: mutual.get(pubkey) ?? 0 };
      by.set(pubkey, creator);
    }
    creator.counts[categoryOf(item)] += 1;
    creator.total += 1;
    if (item.createdAt > creator.latestAt) { creator.latest = item.title; creator.latestAt = item.createdAt; }
  }
  const score = (c: Creator): number => (category === 'all' ? c.total : c.counts[category]);
  return [...by.values()]
    .filter(c => score(c) > 0)
    // Friends of your follows are a group that comes first; inside each group, whoever publishes most of
    // the chosen category leads, and how many of your follows follow them only breaks ties.
    .sort((a, b) => Number(b.mutual > 0) - Number(a.mutual > 0) || score(b) - score(a) || b.mutual - a.mutual || b.latestAt - a.latestAt || a.pubkey.localeCompare(b.pubkey))
    .slice(0, max);
}
