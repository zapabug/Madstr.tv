import { useState, useEffect, useRef, useCallback } from 'react';

// Define default timeouts and check interval (you might want to move these to constants)
const DEFAULT_INTERACTION_TIMEOUT = 180000; // 3 minutes
const DEFAULT_MESSAGE_TIMEOUT = 300000;   // 5 minutes
const CHECK_INTERVAL = 5000;             // Check every 5 seconds

interface UseFullscreenProps {
  interactionTimeout?: number;
  messageTimeout?: number;
  checkInterval?: number;
}

interface UseFullscreenReturn {
  isFullScreen: boolean;
  signalInteraction: () => void;
  signalMessage: () => void;
}

export const useFullscreen = ({
  interactionTimeout = DEFAULT_INTERACTION_TIMEOUT,
  messageTimeout = DEFAULT_MESSAGE_TIMEOUT,
  checkInterval = CHECK_INTERVAL,
}: UseFullscreenProps = {}): UseFullscreenReturn => {
  const [isFullScreen, setIsFullScreen] = useState<boolean>(false);
  const [lastMessageTimestamp, setLastMessageTimestamp] = useState<number>(Date.now());
  const [lastInteractionTimestamp, setLastInteractionTimestamp] = useState<number>(Date.now());
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Function to signal user interaction or a new message, updating timestamps and exiting fullscreen
  const signalActivity = useCallback((isMessage: boolean) => {
    console.log(`useFullscreen: ${isMessage ? 'Message' : 'Interaction'} detected.`);
    const now = Date.now();
    if (isMessage) {
      setLastMessageTimestamp(now);
    }
    // Both messages and interactions count as interactions
    setLastInteractionTimestamp(now);

    if (isFullScreen) {
      console.log(`useFullscreen: Exiting fullscreen due to ${isMessage ? 'new message' : 'interaction'}.`);
      setIsFullScreen(false);
    }
  }, [isFullScreen]); // Depend on isFullScreen to ensure correct state check

  const signalInteraction = useCallback(() => {
    signalActivity(false);
  }, [signalActivity]);

  const signalMessage = useCallback(() => {
    signalActivity(true);
  }, [signalActivity]);

  // Effect for Fullscreen Checks
  useEffect(() => {
    const cleanup = () => {
      if (checkIntervalRef.current) {
        // console.log("useFullscreen Effect: Clearing interval timer.");
        clearInterval(checkIntervalRef.current);
        checkIntervalRef.current = null;
      }
    };

    // If we are already fullscreen, clear any running timer and do nothing else
    if (isFullScreen) {
      cleanup();
      return;
    }

    // --- If NOT fullscreen, start the periodic check ---
    const checkFullScreen = () => {
      const now = Date.now();
      const timeSinceInteraction = now - lastInteractionTimestamp;
      const timeSinceMessage = now - lastMessageTimestamp;

      // console.log(`useFullscreen Check: Interaction=${timeSinceInteraction}ms, Message=${timeSinceMessage}ms`);

      // Check if either condition is met to ENTER fullscreen
      if (timeSinceInteraction >= interactionTimeout || timeSinceMessage >= messageTimeout) {
        console.log("useFullscreen Check: Timeout met, entering fullscreen.");
        setIsFullScreen(true); // This will trigger the effect cleanup
      }
    };

    // Clear any previous interval before starting a new one
    cleanup();
    // Start the check immediately and then set the interval
    checkFullScreen();
    checkIntervalRef.current = setInterval(checkFullScreen, checkInterval);
    console.log("useFullscreen Effect: Started interval timer.");

    // Return the cleanup function to clear interval on unmount or when isFullScreen becomes true
    return cleanup;

  // Depend on the state variables that affect the check conditions and the timeout props
  }, [isFullScreen, lastInteractionTimestamp, lastMessageTimestamp, interactionTimeout, messageTimeout, checkInterval]);

  return { isFullScreen, signalInteraction, signalMessage };
}; 