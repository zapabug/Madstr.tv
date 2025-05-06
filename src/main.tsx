import React, { createContext, useContext } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
// Remove NDK imports
// import NDK, { NDKNip07Signer, NDKPrivateKeySigner, NDKRelaySet, NDKSigner } from '@nostr-dev-kit/ndk';
// import { NDKProvider } from '@nostr-dev-kit/ndk-react';

// Import Applesauce using package names
// Core stores
import { EventStore, QueryStore } from 'applesauce-core';
// React provider
import { QueryStoreProvider } from 'applesauce-react';
// Import constants for RELAYS and TV_PUBKEY_NPUB
import { RELAYS, TV_PUBKEY_NPUB } from './constants';
// Add SimplePool and nip19 import
import { SimplePool, nip19, Filter, type NostrEvent } from 'nostr-tools'; // Ensure NostrEvent and Filter are typed

// Remove NDK setup logic
// const explicitRelayUrls = [
//   'wss://relay.damus.io',
//   'wss://relay.primal.net',
//   'wss://nos.lol',
//   'wss://nostr.wine',
//   // Add more relays as needed
// ];

// // Attempt to use NIP-07 signer if available
// let initialSigner: NDKSigner | undefined = undefined;
// if (window.nostr) {
//   try {
//     initialSigner = new NDKNip07Signer();
//     console.log("NIP-07 Signer initialized.");
//   } catch (e) {
//     console.error("Failed to initialize NIP-07 signer:", e);
//   }
// } else {
//   console.log("NIP-07 Signer not available.");
// }

// // Initialize NDK
// const ndk = new NDK({
//   explicitRelayUrls: explicitRelayUrls,
//   signer: initialSigner, // Use NIP-07 signer if found, otherwise undefined
//   // Other NDK options as needed (debug, etc.)
// });

// // Connect to relays
// ndk.connect().then(() => console.log('NDK connected')).catch(err => console.error('NDK connection error:', err));

// --- SimplePool Setup ---
console.log("main.tsx: Creating SimplePool instance...");
const pool = new SimplePool();
console.log("main.tsx: SimplePool instance created.");

// Create React Context for the pool
const RelayPoolContext = createContext<SimplePool | null>(null);

// Custom hook to use the RelayPool context
export const useRelayPool = () => {
  const context = useContext(RelayPoolContext);
  if (!context) {
    throw new Error('useRelayPool must be used within a RelayPoolProvider');
  }
  return context;
};

// --- Applesauce Core Stores Setup ---
const eventStore = new EventStore();
const queryStore = new QueryStore(eventStore);

// Decode the default TV pubkey for the specific filter
let defaultTvPubkeyHex: string | undefined;
try {
    defaultTvPubkeyHex = nip19.decode(TV_PUBKEY_NPUB).data as string;
    console.log("main.tsx: Decoded TV_PUBKEY_NPUB for filter:", defaultTvPubkeyHex);
} catch (e) {
    console.error("main.tsx: Failed to decode TV_PUBKEY_NPUB:", e);
    // Handle error appropriately, maybe skip the specific filter
}

const tvPubkeyHex = defaultTvPubkeyHex; // Use the potentially undefined value for clarity in filter construction

// ADD Pubkey for NoSolutions (if not already imported globally, define/import here)
const NOSOLUTIONS_PUBKEY_HEX = "9bde421491f3ead1ac21bd1d01667aab947f4c1c4aed87624cf2273b06ca052b";

console.log('main.tsx: Setting up SimplePool subscription to feed EventStore...');
// Define filters: one broad, one specific for default contacts, one for NoSolutions podcasts
const initialFilters: Filter[] = [
    // Broad filter for general content discovery, including profiles and various media types
    // Keep Kind 1 here for general discovery, but the specific NoSolutions filter is more targeted for podcasts
    // REMOVED Kind 31234 and 31337 from this broad filter
    { kinds: [0, 1, 3, 1063, 34235, 9735, 1984, 1985, 10002], limit: 250 }, 
    // Specific filter for NoSolutions Kind 1 podcast events
    { kinds: [1], authors: [NOSOLUTIONS_PUBKEY_HEX], limit: 50 }
];

if (tvPubkeyHex) { // Only add this filter if tvPubkeyHex is a valid string
    initialFilters.push({ kinds: [3], authors: [tvPubkeyHex], limit: 1 });
}

console.log("main.tsx: Using initial filters:", initialFilters);

pool.subscribeMany(RELAYS, initialFilters, {
    onevent(event: NostrEvent) { // Added NostrEvent type
        // Log specific media kinds, profiles, and contacts
        // Make sure this check is first and specific for NoSolutions Kind 1
        if (event.kind === 1 && event.pubkey === NOSOLUTIONS_PUBKEY_HEX) {
            console.log(`[SimplePool NoSolutions Kind 1 Received] id: ${event.id}, author: ${event.pubkey}, content snippet: ${event.content?.substring(0,100)}`);
        } else if (event.kind === 1063 || event.kind === 34235) {
            console.log(`[SimplePool IMAGE/VIDEO Event Kind: ${event.kind} Received] id: ${event.id}, author: ${event.pubkey}`);
        // REMOVED Kind 31234 from this specific logging block
        } else if (event.kind === 0 || event.kind === 3) { 
            console.log(`[SimplePool Specific Kind: ${event.kind} Received]`, { id: event.id, author: event.pubkey, tags: event.tags?.filter(t => t[0] === 'd' || t[0] === 't' || t[0] === 'url' || t[0] === 'media' || t[0] === 'image' || t[0] === 'title').slice(0, 5) });
        // REMOVED log for Kind 31337 (old podcast kind)
        } else if (event.kind === 1) { // General Kind 1 events from other authors
            console.log(`[SimplePool General Kind 1 Received] id: ${event.id}, author: ${event.pubkey}, content snippet: ${event.content?.substring(0,100)}`);
        }
        eventStore.add(event); // Add received event to Applesauce store
    },
    oneose() {
        console.log("SimplePool initial subscription EOSE received.");
        // It's generally better to keep subscriptions open to receive new events,
        // unless specifically managing short-lived queries.
        // For a TV app that should stay updated, keeping them open is usually desired.
    },
    onclose(reason) {
        console.warn("SimplePool initial subscription to a relay closed:", reason);
    }
});
console.log("main.tsx: SimplePool subscription initiated.");

// Render the app with Providers
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* Remove NDKProvider */}
    {/* <NDKProvider ndk={ndk}> */}
    {/* Provide the SimplePool instance via context */}
    <RelayPoolContext.Provider value={pool}>
      <QueryStoreProvider queryStore={queryStore}>
        <App />
      </QueryStoreProvider>
    </RelayPoolContext.Provider>
    {/* </NDKProvider> */}
  </React.StrictMode>,
);
