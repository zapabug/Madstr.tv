import React, { createContext, useContext } from 'react';
import { SimplePool } from 'nostr-tools';

// Create React Context for the pool
export const RelayPoolContext = createContext<SimplePool | null>(null);

// Custom hook to use the RelayPool context
export const useRelayPool = () => {
  const context = useContext(RelayPoolContext);
  if (!context) {
    throw new Error('useRelayPool must be used within a RelayPoolProvider');
  }
  return context;
}; 