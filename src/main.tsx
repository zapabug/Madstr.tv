import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { EventStoreProvider } from 'applesauce-react/providers';
import { App } from './App.tsx';
import { OwnProvider } from './data/own.tsx';
import { restoreAccounts } from './lib/accounts.ts';
import { eventStore } from './lib/applesauce.ts';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root is missing from index.html');

void restoreAccounts();

createRoot(root).render(
  <StrictMode>
    <EventStoreProvider eventStore={eventStore}>
      <OwnProvider>
        <App />
      </OwnProvider>
    </EventStoreProvider>
  </StrictMode>,
);
