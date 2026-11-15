// Every relay the app talks to, in one place. Checked with `pnpm relays` (scripts/probe-relays.mjs) on
// 2026-11-15: each of these opened in under half a second and answered a request. Things to keep out:
//  - relay.nsec.app: it needs NIP-42 auth; a request there silently gets nothing. Never for the signer.
//  - relay.nostr.band: did not connect.
//  - relay.damus.io: connects but never answered a request, so anything waiting on it waits for ever.
// Re-run the probe before adding a relay; relays come and go.

/** Where pictures, videos, music and posts are read from. */
export const CONTENT_RELAYS: readonly string[] = [
  'wss://relay.primal.net',
  'wss://nos.lol',
  'wss://nostr.wine',
  'wss://relay.olas.app',
  'wss://relay.snort.social',
];

/** Index relays: follow lists and profiles of small accounts often live only here. */
export const LOOKUP_RELAYS: readonly string[] = ['wss://purplepag.es', 'wss://relay.primal.net'];

/** The NIP-46 signer connection (QR, bunker link). Same three as the Madeira Livre app. */
export const SIGNER_RELAYS: readonly string[] = ['wss://nos.lol', 'wss://nostr.mom', 'wss://relay.primal.net'];

/** Where a follow list is looked for: the index relays first, then the content relays. */
export const CONTACT_RELAYS: readonly string[] = [...new Set([...LOOKUP_RELAYS, ...CONTENT_RELAYS])];
