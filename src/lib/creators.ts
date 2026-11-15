import type { MediaItem } from './media.ts';

export interface Creator {
  pubkey: string;
  count: number; // audio items found
  latest: string; // title of their newest item
  latestAt: number;
}

// "Follow more creators": who is publishing audio that you do not follow yet, most
// prolific first. Built only from items that really came from relays.
export function rankCreators(items: MediaItem[], exclude: ReadonlySet<string>, max = 30): Creator[] {
  const by = new Map<string, Creator>();
  for (const item of items) {
    const pubkey = item.pubkey;
    if (!pubkey || exclude.has(pubkey)) continue;
    const seen = by.get(pubkey);
    if (!seen) {
      by.set(pubkey, { pubkey, count: 1, latest: item.title, latestAt: item.createdAt });
    } else {
      seen.count += 1;
      if (item.createdAt > seen.latestAt) { seen.latest = item.title; seen.latestAt = item.createdAt; }
    }
  }
  return [...by.values()]
    .sort((a, b) => b.count - a.count || b.latestAt - a.latestAt || a.pubkey.localeCompare(b.pubkey))
    .slice(0, max);
}
