import { useState, useEffect, useRef } from 'react';
import ndk from '../ndk'; // Import the singleton instance
import NDK from '@nostr-dev-kit/ndk';

interface UseNDKInitReturn {
  isReady: boolean;
  connectionError: Error | null;
  ndkInstance: NDK; // Return the instance for convenience
}

/**
 * Hook to initialize the singleton NDK instance connection.
 * Manages connection state (ready, error).
 * Ensures connection is attempted only once on mount.
 * Provides an 'isReady' flag that becomes true AFTER the first relay connects.
 */
export const useNDKInit = (): UseNDKInitReturn => {
  const [isAttemptingConnection, setIsAttemptingConnection] = useState<boolean>(true);
  const [isReady, setIsReady] = useState<boolean>(false);
  const [connectionError, setConnectionError] = useState<Error | null>(null);
  const connectPromiseResolved = useRef<boolean>(false); // Track if connect() resolved
  const firstConnectHandlerAttached = useRef<boolean>(false); // Prevent multiple listeners

  useEffect(() => {
    let isMounted = true; // Prevent state updates on unmounted component
    let firstConnectListener: (() => void) | null = null; // Store listener for removal

    const connectNDK = async () => {
      console.log('useNDKInit: Attempting NDK connection...');
      setIsAttemptingConnection(true);
      setIsReady(false);
      setConnectionError(null);
      connectPromiseResolved.current = false;

      try {
        // Don't await here, let it run in the background
        ndk.connect().then(() => {
            if (isMounted) {
                console.log('useNDKInit: NDK connect() promise resolved.');
                connectPromiseResolved.current = true;
                // If isReady is already true (listener fired first), we don't need to do anything
                // If not ready, we still wait for the listener.
            }
        }).catch((error) => {
            console.error('useNDKInit: Error connecting NDK:', error);
            if (isMounted) {
                setConnectionError(error instanceof Error ? error : new Error('Failed to connect NDK'));
                setIsReady(false);
                setIsAttemptingConnection(false);
                // Clean up listener if connection promise failed
                if (firstConnectListener) {
                    ndk.pool.off("relay:connect", firstConnectListener);
                }
            }
        });

        // Define the listener function only once
        if (!firstConnectHandlerAttached.current) {
            firstConnectListener = () => {
                console.log("useNDKInit: First relay:connect event detected.");
                if (isMounted && !isReady) { // Set ready only once
                    setIsReady(true);
                    setIsAttemptingConnection(false);
                    // Optionally remove the listener now that we're ready
                    // ndk.pool.off("relay:connect", firstConnectListener!);
                }
            };

            // Attach the listener
            ndk.pool.on("relay:connect", firstConnectListener);
            firstConnectHandlerAttached.current = true;
            console.log('useNDKInit: Attached relay:connect listener.');
        }

      } catch (error) {
        // Catch synchronous errors from ndk.connect() if any (unlikely)
        console.error('useNDKInit: Synchronous error during NDK connect setup:', error);
        if (isMounted) {
          setConnectionError(error instanceof Error ? error : new Error('Failed NDK setup'));
          setIsReady(false);
          setIsAttemptingConnection(false);
        }
      }
    };

    if (!isReady && isAttemptingConnection) { // Only attempt if not already ready/attempting
        connectNDK();
    }

    return () => {
      isMounted = false;
      // Remove listener on unmount if it was attached
      if (firstConnectListener && firstConnectHandlerAttached.current) {
          console.log('useNDKInit: Cleaning up relay:connect listener.');
          ndk.pool.off("relay:connect", firstConnectListener);
          firstConnectHandlerAttached.current = false; // Reset for potential future remounts
      }
      // Singleton NDK is not disconnected here.
    };
    // Re-run if connection attempt failed and we want to retry? For now, run once.
  }, []); // Runs once on mount

  return { isReady, connectionError, ndkInstance: ndk };
}; 