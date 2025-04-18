import { useState, useEffect } from 'react';
import ndk from '../ndk'; // Import the singleton instance
import NDK from '@nostr-dev-kit/ndk';

interface UseNDKInitReturn {
  isConnecting: boolean;
  connectionError: Error | null;
  ndkInstance: NDK; // Return the instance for convenience
}

/**
 * Hook to initialize the singleton NDK instance connection.
 * Manages connection state (loading, error).
 * Ensures connection is attempted only once on mount.
 */
export const useNDKInit = (): UseNDKInitReturn => {
  const [isConnecting, setIsConnecting] = useState<boolean>(true);
  const [connectionError, setConnectionError] = useState<Error | null>(null);

  useEffect(() => {
    let isMounted = true; // Prevent state updates on unmounted component

    const connectNDK = async () => {
      console.log('useNDKInit: Attempting NDK connection...');
      setIsConnecting(true);
      setConnectionError(null);
      try {
        // ndk.connect() doesn't explicitly return connection status in v2,
        // but might throw errors or take time. We assume connection starts here.
        // We rely on other parts of the app using the instance,
        // and potentially NDK events, to know when it's fully ready/connected to relays.
        await ndk.connect(); // Connect the singleton instance
        if (isMounted) {
          console.log('useNDKInit: NDK connect() called successfully.');
          // We mark connecting as false once the connect call finishes,
          // although actual relay connections might still be in progress.
          setIsConnecting(false);
        }
      } catch (error) {
        console.error('useNDKInit: Error connecting NDK:', error);
        if (isMounted) {
          setConnectionError(error instanceof Error ? error : new Error('Failed to connect NDK'));
          setIsConnecting(false);
        }
      }
    };

    // Check if ndk.pool is available which indicates prior connection attempt
    // This check might be fragile depending on NDK internal state management.
    // A more robust check might involve NDK connection status events if available.
    if (!ndk.pool || Object.keys(ndk.pool.relays).length === 0) {
       connectNDK();
    } else {
       console.log('useNDKInit: NDK connection likely already initiated, skipping connect().');
       setIsConnecting(false); // Assume already connected or connecting
    }


    return () => {
      isMounted = false;
      // We generally don't disconnect the singleton NDK instance here
      // as it's intended to persist for the app's lifetime.
      // Disconnection logic might belong elsewhere if needed.
      // console.log('useNDKInit: Cleanup.');
    };
  }, []); // Empty dependency array ensures this runs only once on mount

  return { isConnecting, connectionError, ndkInstance: ndk };
}; 