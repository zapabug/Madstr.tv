import { npubEncode } from 'applesauce-core/helpers';

// Profile names come from relays, so they are untrusted: clipped to this many characters (spec §Names).
export const MAX_NAME = 40;

// The name to show for someone: their profile name (clipped), or the last 5 letters of their npub.
export function shortName(pubkey: string, name?: string): string {
  const set = name?.trim();
  if (set) return set.length > MAX_NAME ? `${set.slice(0, MAX_NAME - 1)}…` : set;
  try {
    return `…${npubEncode(pubkey).slice(-5)}`;
  } catch {
    return `…${pubkey.slice(-5)}`;
  }
}
