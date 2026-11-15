import { EventStore } from 'applesauce-core';
import { RelayPool } from 'applesauce-relay';
import { createEventLoaderForStore } from 'applesauce-loaders/loaders';

import { CONTENT_RELAYS, LOOKUP_RELAYS } from './relays.ts';

// The relay lists live in relays.ts. Nothing here waits on a relay: a pool only connects once something
// subscribes, and every list has several independent relays.
export const RELAYS = CONTENT_RELAYS;
export { LOOKUP_RELAYS };

export const eventStore = new EventStore();
export const pool = new RelayPool();

// Lets the store fetch profiles and other events by id / pointer on demand.
createEventLoaderForStore(eventStore, pool, {
  extraRelays: [...RELAYS],
  lookupRelays: [...LOOKUP_RELAYS],
});
