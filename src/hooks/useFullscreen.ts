import { useState, useEffect, useRef, useCallback } from 'react';

const DEFAULT_INTERACTION_TIMEOUT = 180000;
const DEFAULT_MESSAGE_TIMEOUT = 300000;
const CHECK_INTERVAL = 5000;

interface UseFullscreenProps {
  interactionTimeout?: number;
  messageTimeout?: number;
  checkInterval?: number;
}

interface UseFullscreenReturn {
  isFullScreen: boolean;
  isBrowserFullscreen: boolean;
  signalInteraction: () => void;
  signalMessage: () => void;
  toggleBrowserFullscreen: () => void;
  enterBrowserFullscreen: () => void;
  exitBrowserFullscreen: () => void;
}

export const useFullscreen = ({
  interactionTimeout = DEFAULT_INTERACTION_TIMEOUT,
  messageTimeout = DEFAULT_MESSAGE_TIMEOUT,
  checkInterval = CHECK_INTERVAL,
}: UseFullscreenProps = {}): UseFullscreenReturn => {
  const [isFullScreen, setIsFullScreen] = useState<boolean>(false);
  const [isBrowserFullscreen, setIsBrowserFullscreen] = useState<boolean>(false);
  const [lastMessageTimestamp, setLastMessageTimestamp] = useState<number>(Date.now());
  const [lastInteractionTimestamp, setLastInteractionTimestamp] = useState<number>(Date.now());
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const signalActivity = useCallback((isMessage: boolean) => {
    const now = Date.now();
    if (isMessage) {
      setLastMessageTimestamp(now);
    }
    setLastInteractionTimestamp(now);

    if (isFullScreen) {
      // Reset both timestamps so the immediate checkFullScreen() call in the effect
      // doesn't re-enter fullscreen due to a stale message timeout
      setLastMessageTimestamp(now);
      setIsFullScreen(false);
    }
  }, [isFullScreen]);

  const signalInteraction = useCallback(() => {
    signalActivity(false);
  }, [signalActivity]);

  const signalMessage = useCallback(() => {
    signalActivity(true);
  }, [signalActivity]);

  const enterBrowserFullscreen = useCallback(async () => {
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
        setIsBrowserFullscreen(true);
      }
    } catch (err) {
      console.error('Failed to enter fullscreen:', err);
    }
  }, []);

  const exitBrowserFullscreen = useCallback(async () => {
    try {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
        setIsBrowserFullscreen(false);
      }
    } catch (err) {
      console.error('Failed to exit fullscreen:', err);
    }
  }, []);

  const toggleBrowserFullscreen = useCallback(() => {
    if (isBrowserFullscreen) {
      exitBrowserFullscreen();
    } else {
      enterBrowserFullscreen();
    }
  }, [isBrowserFullscreen, enterBrowserFullscreen, exitBrowserFullscreen]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsBrowserFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    const cleanup = () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
        checkIntervalRef.current = null;
      }
    };

    if (isFullScreen) {
      cleanup();
      return;
    }

    const checkFullScreen = () => {
      const now = Date.now();
      const timeSinceInteraction = now - lastInteractionTimestamp;
      const timeSinceMessage = now - lastMessageTimestamp;

      if (timeSinceInteraction >= interactionTimeout || timeSinceMessage >= messageTimeout) {
        setIsFullScreen(true);
      }
    };

    cleanup();
    checkFullScreen();
    checkIntervalRef.current = setInterval(checkFullScreen, checkInterval);

    return cleanup;
  }, [isFullScreen, lastInteractionTimestamp, lastMessageTimestamp, interactionTimeout, messageTimeout, checkInterval]);

  return { 
    isFullScreen, 
    isBrowserFullscreen,
    signalInteraction, 
    signalMessage,
    toggleBrowserFullscreen,
    enterBrowserFullscreen,
    exitBrowserFullscreen,
  };
};
