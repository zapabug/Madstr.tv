import type { MediaItem } from './media.ts';

export interface Creator {
  pubkey: string;
  count: number; // audio items found
  latest: string; // title of their newest item
  latestAt: number;
  mutual: number; // how many of your follows follow them (0 = not a friend of a follow)
}

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

// "Follow more creators": who is publishing audio that you do not follow yet. Friends of your follows
// come first (the more of your follows follow them, the higher), then everyone else, most prolific first.
// Built only from items that really came from relays.
export function rankCreators(items: MediaItem[], exclude: ReadonlySet<string>, max = 30, mutual: ReadonlyMap<string, number> = new Map()): Creator[] {
  const by = new Map<string, Creator>();
  for (const item of items) {
    const pubkey = item.pubkey;
    if (!pubkey || exclude.has(pubkey)) continue;
    const seen = by.get(pubkey);
    if (!seen) {
      by.set(pubkey, { pubkey, count: 1, latest: item.title, latestAt: item.createdAt, mutual: mutual.get(pubkey) ?? 0 });
    } else {
      seen.count += 1;
      if (item.createdAt > seen.latestAt) { seen.latest = item.title; seen.latestAt = item.createdAt; }
    }
  }
  return [...by.values()]
    .sort((a, b) => b.mutual - a.mutual || b.count - a.count || b.latestAt - a.latestAt || a.pubkey.localeCompare(b.pubkey))
    .slice(0, max);
}
