// The events an up vote publishes (spec feat-taste-cache §T2): a NIP-25 like, and the NIP-09 deletion that
// takes it back. Pure templates; signing and publishing live in data/votes.ts.

export interface ReactedEvent {
  id: string;
  pubkey: string;
  kind: number;
  tags: string[][];
}

export interface Template {
  kind: number;
  content: string;
  tags: string[][];
  created_at: number;
}

const HEX64 = /^[0-9a-f]{64}$/;

// A Nostr item's event id, from the app's item id (`nostr:<id>`), or undefined for anything else.
export function eventIdOf(itemId: string): string | undefined {
  const id = itemId.startsWith('nostr:') ? itemId.slice(6) : '';
  return HEX64.test(id) ? id : undefined;
}

export function likeTemplate(event: ReactedEvent, now: number): Template {
  const tags: string[][] = [['e', event.id, '', event.pubkey], ['p', event.pubkey], ['k', String(event.kind)]];
  // An addressable track (kind 30000-39999, e.g. 31337) is also pointed at by its address.
  if (event.kind >= 30000 && event.kind < 40000) {
    const d = event.tags.find(t => t[0] === 'd')?.[1] ?? '';
    tags.push(['a', `${event.kind}:${event.pubkey}:${d}`]);
  }
  return { kind: 7, content: '+', tags, created_at: now };
}

export function unlikeTemplate(reactionId: string, now: number): Template {
  return { kind: 5, content: '', tags: [['e', reactionId], ['k', '7']], created_at: now };
}
