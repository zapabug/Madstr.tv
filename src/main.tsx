import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
// Remove NDK imports
// import NDK, { NDKNip07Signer, NDKPrivateKeySigner, NDKRelaySet, NDKSigner } from '@nostr-dev-kit/ndk';
// import { NDKProvider } from '@nostr-dev-kit/ndk-react';

// Import Applesauce using package names
import { EventStore, QueryStore, SignerStore } from 'applesauce-core';
import { QueryStoreProvider } from 'applesauce-react';

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

// Initialize Applesauce Core Stores
const eventStore = new EventStore();
const queryStore = new QueryStore(eventStore);
const signerStore = new SignerStore();

// Render the app with Applesauce Provider
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* Remove NDKProvider */}
    {/* <NDKProvider ndk={ndk}> */}
    <QueryStoreProvider queryStore={queryStore} signerStore={signerStore}>
      <App />
    </QueryStoreProvider>
    {/* </NDKProvider> */}
  </React.StrictMode>,
);
