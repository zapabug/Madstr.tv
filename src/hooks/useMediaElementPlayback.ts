import { useState, useEffect, useRef, useCallback } from 'react';

// --- Playback Position Storage (copied from Podcastr) ---
const PLAYBACK_POS_PREFIX = 'podcastPlaybackPos_';

const savePlaybackTime = (url: string, time: number) => {
  try {
    localStorage.setItem(PLAYBACK_POS_PREFIX + url, time.toString());
  } catch (e) {
    console.error("Failed to save playback time to localStorage:", e);
  }
};

const getPlaybackTime = (url: string): number | null => {
  try {
    const storedTime = localStorage.getItem(PLAYBACK_POS_PREFIX + url);
    if (storedTime !== null) {
      const parsedTime = parseFloat(storedTime);
      if (!isNaN(parsedTime)) {
        return parsedTime;
      }
    }
  } catch (e) {
    console.error("Failed to retrieve playback time from localStorage:", e);
  }
  return null;
};
// --- End Playback Position Storage ---

// --- Hook Definition ---
interface UseMediaElementPlaybackProps {
  mediaElementRef: React.RefObject<HTMLMediaElement>;
  currentItemUrl: string | null;
  onEnded?: () => void;
  initialTime?: number;
}

interface UseMediaPlaybackResult {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  isSeeking: boolean;
  setPlaybackRate: (rate: number) => void;
  togglePlayPause: () => void;
  handleSeek: (event: React.ChangeEvent<HTMLInputElement>) => void;
  play: () => void;
  pause: () => void;
  setIsSeeking: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useMediaElementPlayback({
  mediaElementRef,
  currentItemUrl,
  onEnded,
  initialTime = 0,
}: UseMediaElementPlaybackProps): UseMediaPlaybackResult {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRateState] = useState(1.0);
  const [isSeeking, setIsSeeking] = useState(false);
  const isProgrammaticSeek = useRef(false);
  const lastSaveTimeRef = useRef<number>(0); // For throttling saves
  const SAVE_INTERVAL = 5000; // Save every 5 seconds

  const updateProgress = useCallback(() => {
    if (mediaElementRef.current && !isSeeking) {
      setCurrentTime(mediaElementRef.current.currentTime);
      setDuration(mediaElementRef.current.duration || 0);
    }
  }, [mediaElementRef, isSeeking]);

  useEffect(() => {
    const mediaElement = mediaElementRef.current;
    if (!mediaElement || !currentItemUrl) {
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      return;
    }

    const handleLoadedMetadata = () => {
      setDuration(mediaElement.duration);
      // Set initial time if provided and different from current
      if (
        initialTime > 0 &&
        Math.abs(mediaElement.currentTime - initialTime) > 0.1 // Avoid tiny seeks
      ) {
        console.log(
          `Setting initial time for ${currentItemUrl} to ${initialTime}`
        );
        isProgrammaticSeek.current = true; // Flag the programmatic seek
        mediaElement.currentTime = initialTime;
        // We might need to explicitly play after seek on some browsers
        // mediaElement.play().catch(error => console.error("Error playing after initial seek:", error));
        // setIsPlaying(true); // Reflect potential auto-play after seek
      } else {
        // Reset currentTime state if initialTime is 0 or not provided
        setCurrentTime(0);
      }
      // Reset the flag after potential seek attempt
      // setTimeout(() => isProgrammaticSeek.current = false, 50); // Short delay
    };

    const handleTimeUpdate = () => {
      // Only update state if not currently seeking via slider
      if (!isSeeking) {
        setCurrentTime(mediaElement.currentTime);
      }
      // Reset programmatic seek flag once time updates *after* the seek
      if (isProgrammaticSeek.current && Math.abs(mediaElement.currentTime - initialTime) < 0.5) {
         isProgrammaticSeek.current = false;
      }
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => {
        // Only set isPlaying to false if it wasn't paused by a programmatic seek
        if (!isProgrammaticSeek.current) {
            setIsPlaying(false);
        }
    }
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(mediaElement.duration); // Ensure time shows full duration
      if (onEnded) {
        onEnded();
      }
    };
    const handleRateChange = () => setPlaybackRateState(mediaElement.playbackRate);

    // Reset state for new source
    setIsPlaying(false);
    setCurrentTime(initialTime); // Set initial time before loading starts
    setDuration(0); // Reset duration until loaded
    mediaElement.src = currentItemUrl;
    mediaElement.load(); // Important to load the new source
    // Attempt to play immediately if needed (might require user interaction)
    // mediaElement.play().catch(e => console.log("Autoplay prevented:", e));


    mediaElement.addEventListener('loadedmetadata', handleLoadedMetadata);
    mediaElement.addEventListener('timeupdate', handleTimeUpdate);
    mediaElement.addEventListener('play', handlePlay);
    mediaElement.addEventListener('pause', handlePause);
    mediaElement.addEventListener('ended', handleEnded);
    mediaElement.addEventListener('ratechange', handleRateChange);

    return () => {
      mediaElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
      mediaElement.removeEventListener('timeupdate', handleTimeUpdate);
      mediaElement.removeEventListener('play', handlePlay);
      mediaElement.removeEventListener('pause', handlePause);
      mediaElement.removeEventListener('ended', handleEnded);
      mediaElement.removeEventListener('ratechange', handleRateChange);
      // Optional: Pause media when component unmounts or URL changes
      if (!mediaElement.paused) {
         mediaElement.pause();
      }
       // Reset source to prevent playing old media briefly on next load
       // mediaElement.src = '';
       // mediaElement.removeAttribute('src');
       // mediaElement.load();
    };
    // Add initialTime to dependency array
  }, [currentItemUrl, mediaElementRef, onEnded, isSeeking, initialTime]);

  // --- Effect to apply playbackRate ---
  useEffect(() => {
    const mediaElement = mediaElementRef.current;
    if (mediaElement) {
      mediaElement.playbackRate = playbackRate;
    }
  }, [playbackRate, mediaElementRef]);

  // --- Event Handlers for Audio Element (managed internally) ---
  const handleLoadedMetadata = useCallback(() => {
      const mediaElement = mediaElementRef.current;
      if (!mediaElement || !currentItemUrl) return;
      
      console.log("useMediaElementPlayback: Metadata loaded, duration:", mediaElement.duration);
      setDuration(mediaElement.duration);

      // Restore playback position
      const savedTime = getPlaybackTime(currentItemUrl);
      if (savedTime !== null && isFinite(savedTime) && savedTime < mediaElement.duration) {
          console.log(`useMediaElementPlayback: Restoring playback position for ${currentItemUrl} to ${savedTime}`);
          mediaElement.currentTime = savedTime;
          setCurrentTime(savedTime); 
      } else {
          setCurrentTime(0); // Ensure state consistency
      }
      // If it was playing before the src change, attempt to resume play
      // This relies on the browser allowing play after metadata load + potential seek
      // Consider adding a check here or relying on user interaction if autoplay is unreliable.

  }, [mediaElementRef, currentItemUrl]);

  const handleTimeUpdate = useCallback(() => {
      const mediaElement = mediaElementRef.current;
      if (!mediaElement || !currentItemUrl || !isFinite(mediaElement.currentTime)) return;

      const currentMediaTime = mediaElement.currentTime;
      setCurrentTime(currentMediaTime);

      // Throttle saving playback time (e.g., every 5 seconds)
      const now = Date.now();
      if (currentItemUrl && now - lastSaveTimeRef.current > SAVE_INTERVAL && !mediaElement.seeking) {
          savePlaybackTime(currentItemUrl, currentMediaTime);
          lastSaveTimeRef.current = now;
      }
  }, [mediaElementRef, currentItemUrl]);

  // --- Effect to attach internal event handlers ---
  useEffect(() => {
      const mediaElement = mediaElementRef.current;
      if (!mediaElement) return;

      const handleError = (e: Event) => {
        console.error("useMediaElementPlayback: Audio Element Error:", mediaElement.error, e);
        // Optionally reset state on error
        setIsPlaying(false);
        setCurrentTime(0);
        setDuration(0);
      };

      mediaElement.addEventListener('loadedmetadata', handleLoadedMetadata);
      mediaElement.addEventListener('timeupdate', handleTimeUpdate);
      mediaElement.addEventListener('error', handleError);

      return () => {
          if (mediaElement) {
              mediaElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
              mediaElement.removeEventListener('timeupdate', handleTimeUpdate);
              mediaElement.removeEventListener('error', handleError);
          }
      };
  }, [mediaElementRef, handleLoadedMetadata, handleTimeUpdate]); // Re-attach if handlers change

  // Define handleError inside the effect where it's used
  useEffect(() => {
    const mediaElement = mediaElementRef.current;
    if (!mediaElement) return;

    const handleError = (e: Event) => {
      console.error("useMediaElementPlayback: Media Element Error:", mediaElement.error, e);
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
    };
    mediaElement.addEventListener('error', handleError);
    return () => {
        if (mediaElement) {
            mediaElement.removeEventListener('error', handleError);
        }
    }
  }, [mediaElementRef]);

  // --- Control Functions (exposed) ---
  const play = useCallback(() => {
    const mediaElement = mediaElementRef.current;
    if (!mediaElement || !currentItemUrl) return;
    console.log("useMediaElementPlayback: play() called");
    mediaElement.play().catch(e => console.error("useMediaElementPlayback: Error in play():", e));
  }, [mediaElementRef, currentItemUrl]);

  const pause = useCallback(() => {
    const mediaElement = mediaElementRef.current;
    if (!mediaElement) return;
    console.log("useMediaElementPlayback: pause() called");
    mediaElement.pause();
  }, [mediaElementRef]);

  const togglePlayPause = useCallback(() => {
    const mediaElement = mediaElementRef.current;
    if (!mediaElement || !currentItemUrl) return; 
    if (mediaElement.paused || mediaElement.ended) {
      play(); // Use the new play function
    } else {
      pause(); // Use the new pause function
    }
  }, [mediaElementRef, currentItemUrl, play, pause]); // Add play/pause as deps

  const handleSeek = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const mediaElement = mediaElementRef.current;
    if (!mediaElement) return;
    const seekTime = parseFloat(event.target.value);
    if (isFinite(seekTime)) {
        mediaElement.currentTime = seekTime;
        setCurrentTime(seekTime); // Update state immediately
        // Save immediately after seeking
        if (currentItemUrl) {
            savePlaybackTime(currentItemUrl, seekTime);
            lastSaveTimeRef.current = Date.now(); // Update last save time
        }
    }
  }, [mediaElementRef, currentItemUrl]);

  // <<< DEFINE setPlaybackRate function >>>
  const setPlaybackRateControl = useCallback((rate: number) => {
    const mediaElement = mediaElementRef.current;
    if (mediaElement) {
        console.log(`useMediaElementPlayback: Setting playback rate to ${rate}`);
        // Update the state, which will trigger the effect to update the element
        setPlaybackRateState(rate);
    }
  }, [mediaElementRef]);

  // --- Return Values ---
  return {
    isPlaying,
    currentTime,
    duration,
    playbackRate,
    setPlaybackRate: setPlaybackRateControl,
    togglePlayPause,
    handleSeek,
    play,
    pause,
    isSeeking,
    setIsSeeking,
  };
} 