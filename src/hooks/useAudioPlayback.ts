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
    const timeStr = localStorage.getItem(PLAYBACK_POS_PREFIX + url);
    if (timeStr) {
      const time = parseFloat(timeStr);
      return !isNaN(time) && isFinite(time) ? time : null;
    }
    return null;
  } catch (e) {
    console.error("Failed to get playback time from localStorage:", e);
    return null;
  }
};
// --- End Playback Position Storage ---

// --- Hook Definition ---
interface UseAudioPlaybackParams {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  currentItemUrl: string | null; // The URL of the currently selected item
  onEnded?: () => void; // Optional callback for when playback ends naturally
}

interface UseAudioPlaybackResult {
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

export function useAudioPlayback({
  audioRef,
  currentItemUrl,
  onEnded,
}: UseAudioPlaybackParams): UseAudioPlaybackResult {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const lastSaveTimeRef = useRef<number>(0); // For throttling saves

  // --- Effect to update audio source and handle playback restoration ---
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // Reset state for new track / URL change
    audio.src = currentItemUrl || '';
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    
    if (currentItemUrl) {
        console.log("useAudioPlayback: Loading new src:", currentItemUrl);
        audio.load(); // Load the new source
    } else {
        console.log("useAudioPlayback: Clearing audio source.");
        audio.removeAttribute('src'); // Clear src if URL is null
        // No need to call load() when clearing src
    }
    
    // Note: Playback restoration (seeking to saved time) happens in handleLoadedMetadata
    // We don't attempt to auto-play here because handleLoadedMetadata might need to seek first.

  }, [currentItemUrl, audioRef]); // Rerun when URL changes

  // --- Effect to apply playbackRate ---
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.playbackRate = playbackRate;
    }
  }, [playbackRate, audioRef]);

  // --- Effect to sync isPlaying state with audio events ---
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
        setIsPlaying(false);
        setCurrentTime(0); // Reset time on end
        if (onEnded) {
            onEnded(); // Call external callback if provided
        }
    };

    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);

    // Sync initial state
    setIsPlaying(!audio.paused);

    return () => {
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [audioRef, onEnded]); // Include onEnded

  // --- Event Handlers for Audio Element (managed internally) ---
  const handleLoadedMetadata = useCallback(() => {
      const audio = audioRef.current;
      if (!audio || !currentItemUrl) return;
      
      console.log("useAudioPlayback: Metadata loaded, duration:", audio.duration);
      setDuration(audio.duration);

      // Restore playback position
      const savedTime = getPlaybackTime(currentItemUrl);
      if (savedTime !== null && isFinite(savedTime) && savedTime < audio.duration) {
          console.log(`useAudioPlayback: Restoring playback position for ${currentItemUrl} to ${savedTime}`);
          audio.currentTime = savedTime;
          setCurrentTime(savedTime); 
      } else {
          setCurrentTime(0); // Ensure state consistency
      }
      // If it was playing before the src change, attempt to resume play
      // This relies on the browser allowing play after metadata load + potential seek
      // Consider adding a check here or relying on user interaction if autoplay is unreliable.

  }, [audioRef, currentItemUrl]);

  const handleTimeUpdate = useCallback(() => {
      const audio = audioRef.current;
      if (!audio || !currentItemUrl || !isFinite(audio.currentTime)) return;

      const currentAudioTime = audio.currentTime;
      setCurrentTime(currentAudioTime);

      // Throttle saving playback time (e.g., every 5 seconds)
      if (Date.now() - lastSaveTimeRef.current > 5000 && !audio.seeking) {
          savePlaybackTime(currentItemUrl, currentAudioTime);
          lastSaveTimeRef.current = Date.now();
      }
  }, [audioRef, currentItemUrl]);

  // --- Effect to attach internal event handlers ---
  useEffect(() => {
      const audio = audioRef.current;
      if (!audio) return;

      audio.addEventListener('loadedmetadata', handleLoadedMetadata);
      audio.addEventListener('timeupdate', handleTimeUpdate);

      return () => {
          audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
          audio.removeEventListener('timeupdate', handleTimeUpdate);
      };
  }, [audioRef, handleLoadedMetadata, handleTimeUpdate]); // Re-attach if handlers change

  // --- Control Functions (exposed) ---
  const togglePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentItemUrl) return; // Don't toggle if no src

    if (audio.paused || audio.ended) {
      console.log("useAudioPlayback: Attempting play...");
      audio.play().catch(e => console.error("useAudioPlayback: Error playing audio:", e));
    } else {
      console.log("useAudioPlayback: Pausing...");
      audio.pause();
    }
  }, [audioRef, currentItemUrl]);

  const handleSeek = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const seekTime = parseFloat(event.target.value);
    if (isFinite(seekTime)) {
        audio.currentTime = seekTime;
        setCurrentTime(seekTime); // Update state immediately
        // Save immediately after seeking
        if (currentItemUrl) {
            savePlaybackTime(currentItemUrl, seekTime);
            lastSaveTimeRef.current = Date.now(); // Update last save time
        }
    }
  }, [audioRef, currentItemUrl]);

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