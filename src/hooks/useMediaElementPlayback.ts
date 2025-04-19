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
  isActiveMode: boolean;
  elementType: 'audio' | 'video';
  onEnded?: () => void;
  initialTime?: number;
  autoplayEnabled: boolean;
  next: boolean;
}

interface UseMediaPlaybackResult {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  isSeeking: boolean;
  isMuted: boolean;
  autoplayFailed: boolean;
  setPlaybackRate: (rate: number) => void;
  togglePlayPause: () => void;
  toggleMute: () => void;
  handleSeek: (event: React.ChangeEvent<HTMLInputElement>) => void;
  play: () => void;
  pause: () => void;
  setIsSeeking: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useMediaElementPlayback({
  mediaElementRef,
  currentItemUrl,
  isActiveMode,
  elementType,
  onEnded,
  initialTime = 0,
  autoplayEnabled,
  next,
}: UseMediaElementPlaybackProps): UseMediaPlaybackResult {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [autoplayFailed, setAutoplayFailed] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRateState] = useState(1.0);
  const [isSeeking, setIsSeeking] = useState(false);
  const isProgrammaticSeek = useRef(false);
  const lastSaveTimeRef = useRef<number>(0);
  const SAVE_INTERVAL = 5000;
  const hasAttemptedPlayRef = useRef(false);
  const initialPlaySuccessfulRef = useRef(false);

  // Define play/pause early
  const play = useCallback(async () => {
    const mediaElement = mediaElementRef.current;
    if (!mediaElement) return;
    if (!isActiveMode && elementType === 'video') {
      console.log(`useMediaElementPlayback (${elementType}): Play called but not active mode, pausing.`);
      mediaElement.pause();
      setIsPlaying(false);
      return;
    }
    try {
      console.log(`useMediaElementPlayback (${elementType}): Attempting play... Current src: ${mediaElement.currentSrc}`);
      hasAttemptedPlayRef.current = true;
      await mediaElement.play();
      console.log(`useMediaElementPlayback (${elementType}): Play command successful.`);
      initialPlaySuccessfulRef.current = true;
    } catch (error) {
      console.error(`useMediaElementPlayback (${elementType}): Playback failed:`, error);
      setAutoplayFailed(true);
      setIsPlaying(false);
      initialPlaySuccessfulRef.current = false;
    }
  }, [mediaElementRef, isActiveMode, elementType]);

  const pause = useCallback(() => {
    const mediaElement = mediaElementRef.current;
    if (mediaElement && !mediaElement.paused) {
      console.log("useMediaElementPlayback: Pausing media.");
      mediaElement.pause();
    }
  }, [mediaElementRef]);

  const updateProgress = useCallback(() => {
    if (mediaElementRef.current && !isSeeking) {
      setCurrentTime(mediaElementRef.current.currentTime);
      setDuration(mediaElementRef.current.duration || 0);
    }
  }, [mediaElementRef, isSeeking]);

  // Combined Play/Pause handler
  const togglePlayPause = useCallback(() => {
    if (mediaElementRef.current) {
      if (mediaElementRef.current.paused) {
        play();
      } else {
        pause();
      }
    }
  }, [play, pause, mediaElementRef]);

  const handleCanPlay = useCallback(() => {
    const mediaElement = mediaElementRef.current;
    if (!mediaElement) return;
    console.log(`useMediaElementPlayback (${elementType}): handleCanPlay - Media ready. isActiveMode: ${isActiveMode}`);

    const currentDuration = mediaElement.duration;
    if (isNaN(currentDuration)) {
      console.warn(`useMediaElementPlayback (${elementType}): Duration is NaN in handleCanPlay.`);
      return; // Wait for loadedmetadata
    }

    // Reset state but don't necessarily play
    setIsPlaying(false);
    setAutoplayFailed(false);
    setDuration(currentDuration);
    setCurrentTime(mediaElement.currentTime); // Ensure currentTime is updated

    if (isActiveMode && autoplayEnabled && elementType === 'audio') {
      console.log(`useMediaElementPlayback (${elementType}): Autoplaying audio on canplay`);
      play();
    } else if (isActiveMode && elementType === 'video') {
      console.log(`useMediaElementPlayback (${elementType}): Video ready, manual play required.`);
      // Do nothing, wait for user interaction
    } else {
      console.log(`useMediaElementPlayback (${elementType}): Ready, but not active mode or autoplay disabled.`);
    }
  }, [mediaElementRef, isActiveMode, elementType, autoplayEnabled, play]);

  const handleEnded = useCallback(() => {
    const mediaElement = mediaElementRef.current;
    if (!mediaElement) return;

    console.log(`useMediaElementPlayback (${elementType}): Ended event fired.`);
    setIsPlaying(false);
    setCurrentTime(mediaElement.duration);
    initialPlaySuccessfulRef.current = false;

    // If it's a video and part of a sequence (next=true), and still the active mode, call onEnded to advance.
    if (elementType === 'video' && next && isActiveMode) {
      console.log(`useMediaElementPlayback (${elementType}): Video ended, calling onEnded to advance sequence.`);
      onEnded?.();
    } else if (elementType === 'audio' && isActiveMode) {
        // If it's audio and ended, just call the provided onEnded (might stop playback or go to next audio)
        console.log(`useMediaElementPlayback (${elementType}): Audio ended, calling provided onEnded.`);
        onEnded?.();
    } else {
        console.log(`useMediaElementPlayback (${elementType}): Ended, but not advancing (not video/next or not active mode).`);
    }
}, [mediaElementRef, isActiveMode, elementType, next, onEnded]);

  const handleRateChange = useCallback(() => {
    const mediaElement = mediaElementRef.current;
    if (mediaElement) {
        console.log(`useMediaElementPlayback: Setting playback rate to ${mediaElement.playbackRate}`);
        setPlaybackRateState(mediaElement.playbackRate);
    }
  }, [mediaElementRef]);

  const handleVolumeChange = () => {
    console.log("useMediaElementPlayback: VolumeChange event fired. Muted:", mediaElementRef.current?.muted);
    setIsMuted(mediaElementRef.current?.muted || true);
  };

  useEffect(() => {
    const mediaElement = mediaElementRef.current;
    if (!mediaElement || !currentItemUrl) {
      if (mediaElement && !currentItemUrl) {
        console.log("useMediaElementPlayback: currentItemUrl is null, resetting element.");
        if (!mediaElement.paused) mediaElement.pause();
        mediaElement.removeAttribute('src');
        mediaElement.load();
      }
      setIsPlaying(false);
      setIsMuted(true);
      setAutoplayFailed(false);
      setCurrentTime(0);
      setDuration(0);
      hasAttemptedPlayRef.current = false;
      initialPlaySuccessfulRef.current = false;
      return;
    }

    console.log(`useMediaElementPlayback (${elementType}): Effect triggered. URL: ${currentItemUrl}, IsActiveMode: ${isActiveMode}, initialTime: ${initialTime}`);
    
    setIsPlaying(false);
    setIsMuted(true);
    mediaElement.muted = true;
    setAutoplayFailed(false);
    setDuration(0);
    hasAttemptedPlayRef.current = false;
    initialPlaySuccessfulRef.current = false;
    isProgrammaticSeek.current = false;
    lastSaveTimeRef.current = Date.now();

    const handleLoadedMetadata = () => {
      console.log("useMediaElementPlayback: Metadata loaded, duration:", mediaElement.duration);
      setDuration(mediaElement.duration);
      if (initialTime > 0) {
        console.log(`Applying initial time for ${currentItemUrl} to ${initialTime}`);
        isProgrammaticSeek.current = true;
        mediaElement.currentTime = initialTime;
      } else {
        setCurrentTime(mediaElement.currentTime);
      }
    };

    const handleTimeUpdate = () => {
      if (!isSeeking) {
        setCurrentTime(mediaElement.currentTime);
      }
      if (isProgrammaticSeek.current && Math.abs(mediaElement.currentTime - initialTime) < 0.5) {
         isProgrammaticSeek.current = false;
      }
      const now = Date.now();
      if (currentItemUrl && now - lastSaveTimeRef.current > SAVE_INTERVAL && !mediaElement.seeking && mediaElement.currentTime > 0) {
          savePlaybackTime(currentItemUrl, mediaElement.currentTime);
          lastSaveTimeRef.current = now;
      }
    };

    const handlePlay = () => {
      console.log("useMediaElementPlayback: Play event fired.");
      setIsPlaying(true);
      setIsMuted(mediaElement.muted);
      setAutoplayFailed(false);
      hasAttemptedPlayRef.current = true;
      initialPlaySuccessfulRef.current = true;
    };

    const handlePause = () => {
      console.log("useMediaElementPlayback: Pause event fired.");
      if (!isProgrammaticSeek.current) {
        setIsPlaying(false);
      }
    }

    const handleEnded = () => {
      console.log("useMediaElementPlayback: Ended event fired.");
      setIsPlaying(false);
      setCurrentTime(mediaElement.duration);
      initialPlaySuccessfulRef.current = false;
      if (onEnded && isActiveMode) {
        console.log("useMediaElementPlayback: Calling onEnded callback (isActiveMode=true).");
        onEnded();
      }
    };

    mediaElement.addEventListener('loadedmetadata', handleLoadedMetadata);
    mediaElement.addEventListener('timeupdate', handleTimeUpdate);
    mediaElement.addEventListener('play', handlePlay);
    mediaElement.addEventListener('pause', handlePause);
    mediaElement.addEventListener('ended', handleEnded);
    mediaElement.addEventListener('ratechange', handleRateChange);
    mediaElement.addEventListener('volumechange', handleVolumeChange);
    mediaElement.addEventListener('canplay', handleCanPlay);

    console.log(`useMediaElementPlayback (${elementType}): Setting src to ${currentItemUrl}`);
    mediaElement.src = currentItemUrl;
    console.log("useMediaElementPlayback: Explicitly calling load() for new source.");
    mediaElement.load();

    return () => {
      console.log("useMediaElementPlayback: Cleaning up listeners for URL:", currentItemUrl);
      mediaElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
      mediaElement.removeEventListener('timeupdate', handleTimeUpdate);
      mediaElement.removeEventListener('play', handlePlay);
      mediaElement.removeEventListener('pause', handlePause);
      mediaElement.removeEventListener('ended', handleEnded);
      mediaElement.removeEventListener('ratechange', handleRateChange);
      mediaElement.removeEventListener('volumechange', handleVolumeChange);
      mediaElement.removeEventListener('canplay', handleCanPlay);
      
      if (!mediaElement.paused) {
         console.log("useMediaElementPlayback: Pausing media during cleanup.");
         mediaElement.pause();
      }
    };
  }, [currentItemUrl, mediaElementRef, onEnded, isSeeking, initialTime, isActiveMode, elementType, autoplayEnabled, duration, play]);

  useEffect(() => {
    const mediaElement = mediaElementRef.current;
    if (mediaElement) {
      mediaElement.playbackRate = playbackRate;
    }
  }, [playbackRate, mediaElementRef]);

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

  const toggleMute = useCallback(() => {
      const mediaElement = mediaElementRef.current;
      if (!mediaElement) return;
      const currentlyMuted = mediaElement.muted;
      console.log(`useMediaElementPlayback: toggleMute() called. Currently muted: ${currentlyMuted}`);
      mediaElement.muted = !currentlyMuted;
  }, [mediaElementRef]);

  const handleSeek = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const mediaElement = mediaElementRef.current;
    if (!mediaElement) return;
    const seekTime = parseFloat(event.target.value);
    if (isFinite(seekTime)) {
        mediaElement.currentTime = seekTime;
        setCurrentTime(seekTime);
        if (currentItemUrl) {
            savePlaybackTime(currentItemUrl, seekTime);
            lastSaveTimeRef.current = Date.now();
        }
    }
  }, [mediaElementRef, currentItemUrl]);

  const setPlaybackRateControl = useCallback((rate: number) => {
    const mediaElement = mediaElementRef.current;
    if (mediaElement) {
        console.log(`useMediaElementPlayback: Setting playback rate to ${rate}`);
        setPlaybackRateState(rate);
    }
  }, [mediaElementRef]);

  return {
    isPlaying,
    currentTime,
    duration,
    playbackRate,
    setPlaybackRate: setPlaybackRateControl,
    togglePlayPause,
    toggleMute,
    handleSeek,
    play,
    pause,
    isSeeking,
    setIsSeeking,
    isMuted,
    autoplayFailed,
  };
} 