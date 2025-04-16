import { useEffect } from 'react';

interface UseImageCarouselProps {
  isActive: boolean;        // Should the timer be running?
  onTick: () => void;       // Function to call on each interval tick
  intervalDuration: number; // Duration of the interval in milliseconds
}

export const useImageCarousel = ({
  isActive,
  onTick,
  intervalDuration,
}: UseImageCarouselProps) => {
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;

    // Start timer only if the carousel is active
    if (isActive) {
      console.log(`useImageCarousel: Starting timer (${intervalDuration}ms).`);
      intervalId = setInterval(() => {
        console.log("useImageCarousel: Timer fired, calling onTick.");
        onTick(); 
      }, intervalDuration);
    }

    // Cleanup function: Clear timer if it exists when effect cleans up or isActive changes
    return () => {
      if (intervalId) {
        console.log("useImageCarousel: Clearing timer.");
        clearInterval(intervalId);
      }
    };

    // Re-run effect if isActive status, the callback, or duration changes
  }, [isActive, onTick, intervalDuration]);
}; 