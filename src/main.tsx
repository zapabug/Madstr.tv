import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { EventStoreProvider } from 'applesauce-react/providers';
import { App } from './App.tsx';
import { eventStore } from './lib/applesauce.ts';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root is missing from index.html');

createRoot(root).render(
  <StrictMode>
    <EventStoreProvider eventStore={eventStore}>
      <App />
    </EventStoreProvider>
  </StrictMode>,
);
