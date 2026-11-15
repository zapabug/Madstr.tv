import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { EventStoreProvider } from 'applesauce-react/providers';
import { App } from './App.tsx';
import { OwnProvider } from './data/own.tsx';
import { restoreAccounts } from './lib/accounts.ts';
import { eventStore } from './lib/applesauce.ts';
import { startEventCache } from './lib/eventCache.ts';
import { startDurationCache } from './lib/durations.ts';
import { isNativeApp } from './lib/platform.ts';
import { startWebMediaSession } from './pwa/mediaSession.ts';
import { registerServiceWorker } from './pwa/registerSw.ts';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root is missing from index.html');

// The device cache first, so what it holds is in the store before the relays answer (it never blocks rendering).
startEventCache();
startDurationCache();
void restoreAccounts();
registerServiceWorker();
// Marks the page as the Android app, for what only the app does (the sideways view, feat-taste-cache §T7).
if (isNativeApp()) document.documentElement.dataset.native = '';
if (isNativeApp()) void import('./native/nowPlayingNative.ts').then(m => { m.startNativeControls(); });
else startWebMediaSession();

createRoot(root).render(
  <StrictMode>
    <EventStoreProvider eventStore={eventStore}>
      <OwnProvider>
        <App />
      </OwnProvider>
    </EventStoreProvider>
  </StrictMode>,
);
