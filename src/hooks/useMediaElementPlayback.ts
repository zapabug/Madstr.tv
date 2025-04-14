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
interface UseMediaPlaybackParams {
  mediaRef: React.RefObject<HTMLAudioElement | HTMLVideoElement>;
  currentItemUrl: string | null; // The URL of the currently selected item
  onEnded?: () => void; // Optional callback for when playback ends naturally
}

interface UseMediaPlaybackResult {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  setPlaybackRate: (rate: number) => void;
  togglePlayPause: () => void;
  handleSeek: (event: React.ChangeEvent<HTMLInputElement>) => void;
  // We don't need to return handleLoadedMetadata and handleTimeUpdate
  // as they are internal event handlers for the audio element managed by the hook.
}

export function useMediaElementPlayback({
  mediaRef,
  currentItemUrl,
  onEnded,
}: UseMediaPlaybackParams): UseMediaPlaybackResult {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRateInternal] = useState(1.0);
  const lastSaveTimeRef = useRef<number>(0); // For throttling saves
  const SAVE_INTERVAL = 5000; // Save every 5 seconds

  // --- Effect to update audio source and handle playback restoration ---
  useEffect(() => {
    const mediaElement = mediaRef.current;
    if (!mediaElement) return;

    // Reset state for new track / URL change
    mediaElement.src = currentItemUrl || '';
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    
    if (currentItemUrl) {
        console.log("useMediaElementPlayback: Loading new src:", currentItemUrl);
        mediaElement.load(); // Load the new source
    } else {
        console.log("useMediaElementPlayback: Clearing audio source.");
        mediaElement.removeAttribute('src'); // Clear src if URL is null
        // No need to call load() when clearing src
    }
    
    // Note: Playback restoration (seeking to saved time) happens in handleLoadedMetadata
    // We don't attempt to auto-play here because handleLoadedMetadata might need to seek first.

  }, [currentItemUrl, mediaRef]); // Rerun when URL changes

  // --- Effect to apply playbackRate ---
  useEffect(() => {
    const mediaElement = mediaRef.current;
    if (mediaElement) {
      mediaElement.playbackRate = playbackRate;
    }
  }, [playbackRate, mediaRef]);

  // --- Effect to sync isPlaying state with audio events ---
  useEffect(() => {
    const mediaElement = mediaRef.current;
    if (!mediaElement) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
        setIsPlaying(false);
        setCurrentTime(0); // Reset time on end
        if (onEnded) {
            onEnded(); // Call external callback if provided
        }
    };

    mediaElement.addEventListener('play', handlePlay);
    mediaElement.addEventListener('pause', handlePause);
    mediaElement.addEventListener('ended', handleEnded);

    // Sync initial state
    setIsPlaying(!mediaElement.paused);

    return () => {
      mediaElement.removeEventListener('play', handlePlay);
      mediaElement.removeEventListener('pause', handlePause);
      mediaElement.removeEventListener('ended', handleEnded);
    };
  }, [mediaRef, onEnded]); // Include onEnded

  // --- Event Handlers for Audio Element (managed internally) ---
  const handleLoadedMetadata = useCallback(() => {
      const mediaElement = mediaRef.current;
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

  }, [mediaRef, currentItemUrl]);

  const handleTimeUpdate = useCallback(() => {
      const mediaElement = mediaRef.current;
      if (!mediaElement || !currentItemUrl || !isFinite(mediaElement.currentTime)) return;

      const currentMediaTime = mediaElement.currentTime;
      setCurrentTime(currentMediaTime);

      // Throttle saving playback time (e.g., every 5 seconds)
      const now = Date.now();
      if (currentItemUrl && now - lastSaveTimeRef.current > SAVE_INTERVAL && !mediaElement.seeking) {
          savePlaybackTime(currentItemUrl, currentMediaTime);
          lastSaveTimeRef.current = now;
      }
  }, [mediaRef, currentItemUrl]);

  // --- Effect to attach internal event handlers ---
  useEffect(() => {
      const mediaElement = mediaRef.current;
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
          mediaElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
          mediaElement.removeEventListener('timeupdate', handleTimeUpdate);
          mediaElement.removeEventListener('error', handleError);
      };
  }, [mediaRef, handleLoadedMetadata, handleTimeUpdate]); // Re-attach if handlers change

  // --- Control Functions (exposed) ---
  const togglePlayPause = useCallback(() => {
    const mediaElement = mediaRef.current;
    if (!mediaElement || !currentItemUrl) return; // Don't toggle if no src

    if (mediaElement.paused || mediaElement.ended) {
      console.log("useMediaElementPlayback: Attempting play...");
      mediaElement.play().catch(e => console.error("useMediaElementPlayback: Error playing audio:", e));
    } else {
      console.log("useMediaElementPlayback: Pausing...");
      mediaElement.pause();
    }
  }, [mediaRef, currentItemUrl]);

  const handleSeek = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const mediaElement = mediaRef.current;
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
  }, [mediaRef, currentItemUrl]);

  // <<< DEFINE setPlaybackRate function >>>
  const setPlaybackRate = useCallback((rate: number) => {
    const mediaElement = mediaRef.current; 
    if (mediaElement) {
        console.log(`useMediaElementPlayback: Setting playback rate to ${rate}`);
        mediaElement.playbackRate = rate;
        setPlaybackRateInternal(rate);
    }
  }, [mediaRef]);

  // --- Return Values ---
  return {
    isPlaying,
    currentTime,
    duration,
    playbackRate,
    setPlaybackRate,
    togglePlayPause,
    handleSeek,
  };
} 