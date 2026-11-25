// Every relay the app talks to, in one place. Checked with `pnpm relays` (scripts/probe-relays.mjs) on
// 2026-11-15: each of these opened in under half a second and answered a request. Things to keep out:
//  - relay.nsec.app: it needs NIP-42 auth; a request there silently gets nothing. Never for the signer.
//  - relay.nostr.band: did not connect.
//  - relay.damus.io: connects but never answered a request, so anything waiting on it waits for ever.
// Re-run the probe before adding a relay; relays come and go.

/** Where pictures, videos, music and posts are read from. */
export const CONTENT_RELAYS: readonly string[] = [
  'wss://relay.primal.net',
  'wss://relay.snort.social',
  'wss://nostr.wine',
  'wss://relay.olas.app',
  // Added 2026-11-15 (feat-taste-cache §T5): each answered a probe and held music posts.
  'wss://relay.wavlake.com',
  'wss://theforest.nostr1.com',
  'wss://nostr.bitcoiner.social',
  'wss://relay.nostr.net',
];

/** Index relays: follow lists and profiles of small accounts often live only here.
 *  The content relays are added below so a profile living on any of them is found too. */
export const LOOKUP_RELAYS: readonly string[] = [...new Set([...CONTENT_RELAYS, 'wss://purplepag.es', 'wss://relay.primal.net'])];

/** The NIP-46 signer connection (QR, bunker link). These must overlap the signer's home relays or the
 *  connect request never reaches it: Amber's defaults are relay.primal.net, nostr.oxtr.dev and
 *  theforest.nostr1.com, and it also watches relay.nip46.com (probed alive 2026-11-15). A QR that named
 *  only nos.lol/nostr.mom/primal never triggered Amber on zapa's phone — its working bunker listed
 *  relay.nip46.com and theforest.nostr1.com. */
export const SIGNER_RELAYS: readonly string[] = [
  'wss://relay.primal.net',
  'wss://relay.nip46.com',
  'wss://relay.snort.social',
  'wss://theforest.nostr1.com',
];

/** Where a follow list is looked for: the index relays first, then the content relays. */
export const CONTACT_RELAYS: readonly string[] = [...new Set([...LOOKUP_RELAYS, ...CONTENT_RELAYS])];
