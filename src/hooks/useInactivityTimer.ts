import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Custom hook to track user inactivity.
 * Returns a boolean indicating if the user is inactive and a function to manually reset the timer.
 * @param timeout Duration in milliseconds after which the user is considered inactive.
 */
export function useInactivityTimer(timeout: number): [boolean, () => void] {
  const [isInactive, setIsInactive] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const resetTimer = useCallback(() => {
    // Clear existing timer
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    // If currently marked as inactive, mark as active immediately
    // Prevents flickering if activity happens right before timeout
    if (isInactive) {
      setIsInactive(false);
    }

    // Set a new timer
    timerRef.current = setTimeout(() => {
      setIsInactive(true);
      timerRef.current = null; // Clear ref after timer fires
    }, timeout);
  }, [timeout, isInactive]); // Include isInactive in dependency

  // Initial timer setup and cleanup on mount/unmount/timeout change
  useEffect(() => {
    resetTimer(); // Start the timer

    // Cleanup function to clear timeout on unmount or timeout change
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [resetTimer]); // resetTimer includes timeout and isInactive, so this is correct

  // Return the state and the reset function
  return [isInactive, resetTimer];
} 