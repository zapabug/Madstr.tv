import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { NostrProvider } from 'nostr-hooks';
import { RELAYS } from './constants';

const relayUrls = Array.isArray(RELAYS) ? RELAYS : [];
if (relayUrls.length === 0) {
  console.warn('main.tsx: No relay URLs found in constants.ts. NostrProvider might not connect.');
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <NostrProvider relayUrls={relayUrls} debug={true}>
      <App />
    </NostrProvider>
  </React.StrictMode>,
);
