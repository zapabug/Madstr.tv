import { useState, useEffect, useRef, useCallback } from 'react';

// Define default timeouts and check interval (Restore original values if known, otherwise use placeholders)
const DEFAULT_INTERACTION_TIMEOUT = 180000; // 3 minutes (Adjust if original was different)
const DEFAULT_MESSAGE_TIMEOUT = 300000;   // 5 minutes (Adjust if original was different)
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

// Original implementation (State management only)
export const useFullscreen = ({
  interactionTimeout = DEFAULT_INTERACTION_TIMEOUT,
  messageTimeout = DEFAULT_MESSAGE_TIMEOUT,
  checkInterval = CHECK_INTERVAL,
}: UseFullscreenProps = {}): UseFullscreenReturn => {
  const [isFullScreen, setIsFullScreen] = useState<boolean>(false);
  const [lastMessageTimestamp, setLastMessageTimestamp] = useState<number>(Date.now());
  const [lastInteractionTimestamp, setLastInteractionTimestamp] = useState<number>(Date.now());
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Function to signal user interaction or a new message, updating timestamps and exiting fullscreen state
  const signalActivity = useCallback((isMessage: boolean) => {
    console.log(`useFullscreen (Original): ${isMessage ? 'Message' : 'Interaction'} detected.`);
    const now = Date.now();
    if (isMessage) {
      setLastMessageTimestamp(now);
    }
    setLastInteractionTimestamp(now); // Update interaction time for both

    if (isFullScreen) {
      console.log(`useFullscreen (Original): Exiting fullscreen state due to ${isMessage ? 'new message' : 'interaction'}.`);
      setIsFullScreen(false); // Only change internal state
    }
  }, [isFullScreen]);

  const signalInteraction = useCallback(() => {
    signalActivity(false);
  }, [signalActivity]);

  const signalMessage = useCallback(() => {
    signalActivity(true);
  }, [signalActivity]);

  // Effect for Fullscreen Timeout Checks (Original logic)
  useEffect(() => {
    const cleanup = () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
        checkIntervalRef.current = null;
      }
    };

    if (isFullScreen) {
      cleanup(); // Stop checking if we think we are fullscreen
      return;
    }

    const checkFullScreen = () => {
      const now = Date.now();
      const timeSinceInteraction = now - lastInteractionTimestamp;
      const timeSinceMessage = now - lastMessageTimestamp;

      if (timeSinceInteraction >= interactionTimeout || timeSinceMessage >= messageTimeout) {
        console.log("useFullscreen (Original): Timeout met, entering fullscreen state.");
        setIsFullScreen(true); // Only change internal state
      }
    };

    cleanup(); // Clear previous interval
    checkFullScreen(); // Initial check
    checkIntervalRef.current = setInterval(checkFullScreen, checkInterval);
    console.log("useFullscreen (Original): Started interval timer.");

    return cleanup; // Cleanup interval on unmount or when isFullScreen becomes true

  }, [isFullScreen, lastInteractionTimestamp, lastMessageTimestamp, interactionTimeout, messageTimeout, checkInterval]);

  return { isFullScreen, signalInteraction, signalMessage };
}; 