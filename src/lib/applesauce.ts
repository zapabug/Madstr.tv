import { EventStore } from 'applesauce-core';
import { RelayPool } from 'applesauce-relay';
import { createEventLoaderForStore } from 'applesauce-loaders/loaders';

// Relays that answer. The old app also listed relay.nostr.band and nsec.app, which
// never connected and held the whole app on a loading screen; nothing here waits
// on a relay, and a pool only connects once something subscribes.
export const RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://nos.lol',
  'wss://nostr.wine',
];

export const LOOKUP_RELAYS = ['wss://purplepag.es', 'wss://relay.damus.io'];

export const eventStore = new EventStore();
export const pool = new RelayPool();

// Lets the store fetch profiles and other events by id / pointer on demand.
createEventLoaderForStore(eventStore, pool, {
  extraRelays: RELAYS,
  lookupRelays: LOOKUP_RELAYS,
});
