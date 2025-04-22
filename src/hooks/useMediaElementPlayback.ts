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

export function useMediaElementPlayback(props: UseMediaElementPlaybackProps): UseMediaPlaybackResult {
  const {
    mediaElementRef,
    currentItemUrl,
    isActiveMode,
    elementType,
    onEnded,
    initialTime = 0,
    autoplayEnabled,
    next,
  } = props;

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
  const isEndedRef = useRef(false);

  // Define play/pause early
  const play = useCallback(async () => {
    const mediaElement = mediaElementRef.current;
    console.log(`useMediaElementPlayback (${elementType}): play() function called.`);
    if (!mediaElement) return;
    if (!isActiveMode && elementType === 'video') {
      console.log(`useMediaElementPlayback (${elementType}): Play called but not active mode, pausing.`);
      mediaElement.pause();
      setIsPlaying(false);
      return;
    }

    try {
      console.log(`useMediaElementPlayback (${elementType}): Attempting play... Current src: ${mediaElement.currentSrc}, Element Muted: ${mediaElement.muted}`);
      hasAttemptedPlayRef.current = true;
      setAutoplayFailed(false);
      await mediaElement.play();
      console.log(`useMediaElementPlayback (${elementType}): Play command successful.`);
      setIsPlaying(true);
      initialPlaySuccessfulRef.current = true;

      console.log(`useMediaElementPlayback (${elementType}): Attempting to unmute after successful play.`);
      mediaElement.muted = false;
      const finalMutedState = mediaElement.muted;
      setIsMuted(finalMutedState);
      if (finalMutedState) {
          console.warn(`useMediaElementPlayback (${elementType}): Browser prevented unmuting. Video will play muted.`);
      } else {
          console.log(`useMediaElementPlayback (${elementType}): Unmute successful or was already unmuted.`);
      }

    } catch (error) {
      console.error(`useMediaElementPlayback (${elementType}): play() failed:`, error);
      setIsPlaying(false);
      setAutoplayFailed(true);
      initialPlaySuccessfulRef.current = false;
      if (mediaElement) {
          setIsMuted(mediaElement.muted);
      }
    }
  }, [mediaElementRef, isActiveMode, elementType]);

  const pause = useCallback(() => {
    const mediaElement = mediaElementRef.current;
    console.log(`useMediaElementPlayback (${elementType}): pause() function called.`);
    if (mediaElement && !mediaElement.paused) {
      console.log("useMediaElementPlayback: Pausing media.");
      mediaElement.pause();
    }
  }, [mediaElementRef, elementType]);

  const updateProgress = useCallback(() => {
    if (mediaElementRef.current && !isSeeking) {
      setCurrentTime(mediaElementRef.current.currentTime);
      setDuration(mediaElementRef.current.duration || 0);
    }
  }, [mediaElementRef, isSeeking]);

  // Combined Play/Pause handler
  const togglePlayPause = useCallback(() => {
    console.log(`%%% Playback (${elementType}): togglePlayPause called. Paused state: ${mediaElementRef.current?.paused}`);
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
    console.log(`%%% Playback (${elementType}): handleCanPlay event. isActiveMode: ${isActiveMode}`);

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
      console.log(`%%% Playback (${elementType}): Attempting autoplay...`);
      play();
    } else if (isActiveMode && elementType === 'video') {
      console.log(`useMediaElementPlayback (${elementType}): Video ready, manual play required.`);
      // Do nothing, wait for user interaction
    } else {
      console.log(`useMediaElementPlayback (${elementType}): Ready, but not active mode or autoplay disabled.`);
    }
  }, [mediaElementRef, isActiveMode, elementType, autoplayEnabled, play]);

  // --- Effect 1: Load Source URL & Reset State ---
  useEffect(() => {
    console.log(`%%% Playback (${elementType}): Effect 1 (Load Source) RUNNING for URL: ${currentItemUrl}`);
    const element = mediaElementRef.current;
    if (!element) {
      console.log(`%%% Playback (${elementType}): Effect 1 Aborting - No media element.`);
      return;
    }

    // --- Reset logic if URL is null ---
    if (!currentItemUrl) {
      console.log(`%%% Playback (${elementType}): Effect 1 - currentItemUrl is null, resetting element.`);
      if (!element.paused) element.pause();
      element.removeAttribute('src');
      element.load(); // Reset the element state
      // Reset hook state
      setIsPlaying(false);
      setIsMuted(true);
      setAutoplayFailed(false);
      setCurrentTime(0);
      setDuration(0);
      hasAttemptedPlayRef.current = false;
      initialPlaySuccessfulRef.current = false;
      isEndedRef.current = false;
      return;
    }

    // --- Logic when URL is valid ---
    // Only set src and load if it's actually different
    if (element.currentSrc !== currentItemUrl) {
      console.log(`%%% Playback (${elementType}): Effect 1 - Setting new src: ${currentItemUrl}`);
      element.src = currentItemUrl;
      element.load(); // Load the new source
      // Reset state on source change
      setIsPlaying(false);
      setIsMuted(true);
      setAutoplayFailed(false);
      setCurrentTime(0);
      setDuration(0);
      hasAttemptedPlayRef.current = false;
      initialPlaySuccessfulRef.current = false;

      if (isEndedRef.current && elementType === 'video') {
        console.log(`%%% Playback (${elementType}): isEndedRef is true, setting up one-time canplay listener for autoplay.`);
        const handleCanPlayForAutoplay = () => {
          console.log(`%%% Playback (${elementType}): CanPlay listener (for ended autoplay) fired.`);
          play();
          isEndedRef.current = false;
          element.removeEventListener('canplay', handleCanPlayForAutoplay);
        };
        element.addEventListener('canplay', handleCanPlayForAutoplay);
      } else {
         isEndedRef.current = false;
      }

    } else {
        console.log(`%%% Playback (${elementType}): Effect 1 - currentItemUrl is same as currentSrc, skipping src set/load.`);
    }

  }, [currentItemUrl, mediaElementRef, elementType, play]);

  // --- Effect 2: Set Initial Time & Restore Saved Position ---
  useEffect(() => {
    console.log(`%%% Playback (${elementType}): Effect 2 (Initial Time) RUNNING`);
    const element = mediaElementRef.current;
    if (!element || !currentItemUrl) {
        console.log(`%%% Playback (${elementType}): Effect 2 Aborting - No element or URL.`);
        return;
    }

    const restoredTime = elementType === 'audio' ? getPlaybackTime(currentItemUrl) : null;
    const timeToSet = restoredTime !== null ? restoredTime : initialTime;

    console.log(`%%% Playback (${elementType}): Effect 2 - Time to set: ${timeToSet} (Restored: ${restoredTime}, Initial: ${initialTime})`);

    if (timeToSet > 0 && element.duration > 0 && timeToSet < element.duration) {
        const handleSeeked = () => {
            console.log(`%%% Playback (${elementType}): Effect 2 - Seeked to ${timeToSet} successfully.`);
            element.removeEventListener('seeked', handleSeeked);
            isProgrammaticSeek.current = false;
        };
        const handleCanPlay = () => {
            console.log(`%%% Playback (${elementType}): Effect 2 - CanPlay received, attempting seek to ${timeToSet}.`);
            element.removeEventListener('canplay', handleCanPlay);
            if (Math.abs(element.currentTime - timeToSet) > 0.1) {
                isProgrammaticSeek.current = true;
                element.addEventListener('seeked', handleSeeked);
                element.currentTime = timeToSet;
                console.log(`%%% Playback (${elementType}): Effect 2 - Setting currentTime to ${timeToSet}.`);
            } else {
                console.log(`%%% Playback (${elementType}): Effect 2 - Already at or near target time ${timeToSet}, skipping seek.`);
            }
        };

        if (element.readyState >= 2 /* HAVE_CURRENT_DATA */) {
            console.log(`%%% Playback (${elementType}): Effect 2 - ReadyState sufficient, attempting seek immediately.`);
            if (Math.abs(element.currentTime - timeToSet) > 0.1) {
                isProgrammaticSeek.current = true;
                element.addEventListener('seeked', handleSeeked);
                element.currentTime = timeToSet;
                console.log(`%%% Playback (${elementType}): Effect 2 - Setting currentTime to ${timeToSet}.`);
            } else {
                 console.log(`%%% Playback (${elementType}): Effect 2 - Already at or near target time ${timeToSet}, skipping seek.`);
            }
        } else {
            console.log(`%%% Playback (${elementType}): Effect 2 - Waiting for 'canplay' before seeking.`);
            element.addEventListener('canplay', handleCanPlay);
        }
    } else {
        console.log(`%%% Playback (${elementType}): Effect 2 - Not seeking (timeToSet=0 or invalid).`);
    }

    return () => {
        element.removeEventListener('canplay', handleCanPlay);
        // element.removeEventListener('seeked', handleSeeked); // <<< handleSeeked is local, cannot remove here directly. Seek logic handles removal.
        isProgrammaticSeek.current = false;
    };

  }, [currentItemUrl, initialTime, mediaElementRef, elementType]);

  // --- Effect 3: Core Event Listeners ---
  useEffect(() => {
    console.log(`%%% Playback (${elementType}): Effect 3 (Core Listeners) RUNNING`);
    const element = mediaElementRef.current;
    if (!element) {
      console.log(`%%% Playback (${elementType}): Effect 3 Aborting - No media element.`);
      return;
    }

    const handleLoadedMetadata = () => {
      console.log(`%%% Playback (${elementType}): handleLoadedMetadata event`);
      const currentDuration = element.duration;
      if (!isNaN(currentDuration)) {
        setDuration(currentDuration);
      } else {
        console.warn(`useMediaElementPlayback (${elementType}): Duration is NaN in loadedmetadata.`);
      }
      setCurrentTime(element.currentTime);
    };
    const handlePlay = () => { console.log(`%%% Playback (${elementType}): handlePlay event`); setIsPlaying(true); setAutoplayFailed(false); };
    const handlePause = () => { console.log(`%%% Playback (${elementType}): handlePause event`); setIsPlaying(false); };
    const handleEnded = () => {
        console.log(`%%% Playback (${elementType}): handleEnded event fired.`);
        setIsPlaying(false);
        initialPlaySuccessfulRef.current = false;
        if (element) setCurrentTime(element.duration);

        if (isActiveMode && next) {
             if (elementType === 'video') {
                 console.log(`%%% Playback (video): Ended, setting isEndedRef=true and calling onEnded prop.`);
                 isEndedRef.current = true;
                 onEnded?.();
             } else if (elementType === 'audio') {
                 console.log(`%%% Playback (audio): Ended, calling onEnded prop directly.`);
                 onEnded?.();
             }
        } else {
            console.log(`%%% Playback (${elementType}): Ended, but not advancing (inactive mode or next=false).`);
             isEndedRef.current = false;
        }
    };
    const handleError = (e: Event) => {
        console.error(`%%% Playback (${elementType}): handleError event`, element.error, e);
        setIsPlaying(false);
        setAutoplayFailed(true);
        setCurrentTime(0);
        setDuration(0);
    };
    const handleVolumeChangeLocal = () => {
        console.log(`%%% Playback (${elementType}): handleVolumeChange event`);
        if (element) setIsMuted(element.muted);
    };
    const handleRateChangeLocal = () => {
        console.log(`%%% Playback (${elementType}): handleRateChange event`);
        if (element) setPlaybackRateState(element.playbackRate);
    };
    const handleTimeUpdate = updateProgress;

    console.log(`%%% Playback (${elementType}): Effect 3 - Adding core listeners.`);
    element.addEventListener('loadedmetadata', handleLoadedMetadata);
    element.addEventListener('play', handlePlay);
    element.addEventListener('pause', handlePause);
    element.addEventListener('ended', handleEnded);
    element.addEventListener('error', handleError);
    element.addEventListener('volumechange', handleVolumeChangeLocal);
    element.addEventListener('ratechange', handleRateChangeLocal);
    element.addEventListener('timeupdate', handleTimeUpdate);

    return () => {
      console.log(`%%% Playback (${elementType}): Effect 3 - Cleaning up core listeners.`);
      element.removeEventListener('loadedmetadata', handleLoadedMetadata);
      element.removeEventListener('play', handlePlay);
      element.removeEventListener('pause', handlePause);
      element.removeEventListener('ended', handleEnded);
      element.removeEventListener('error', handleError);
      element.removeEventListener('volumechange', handleVolumeChangeLocal);
      element.removeEventListener('ratechange', handleRateChangeLocal);
      element.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [mediaElementRef, updateProgress, elementType, onEnded, isActiveMode, next]);

  // --- Effect 4: Time Saving ---
  useEffect(() => {
    console.log(`%%% Playback (${elementType}): Effect 4 (Time Saving) RUNNING`);
    const element = mediaElementRef.current;
    if (!element || elementType !== 'audio' || !currentItemUrl) {
        console.log(`%%% Playback (${elementType}): Effect 4 Aborting - Not applicable.`);
        return;
    }

    const intervalId = setInterval(() => {
      if (element.currentTime > 0 && !element.paused && isPlaying) {
        const now = Date.now();
        if (now - lastSaveTimeRef.current > SAVE_INTERVAL) {
          console.log(`%%% Playback (${elementType}): Effect 4 - Saving time: ${element.currentTime} for ${currentItemUrl}`);
          savePlaybackTime(currentItemUrl, element.currentTime);
          lastSaveTimeRef.current = now;
        }
      }
    }, SAVE_INTERVAL / 2);

    return () => {
      console.log(`%%% Playback (${elementType}): Effect 4 - Cleaning up time saving interval.`);
      clearInterval(intervalId);
      if (element.currentTime > 0 && !element.paused && isPlaying) {
        console.log(`%%% Playback (${elementType}): Effect 4 - Saving final time on cleanup: ${element.currentTime}`);
        savePlaybackTime(currentItemUrl, element.currentTime);
      }
    };
  }, [mediaElementRef, isPlaying, currentItemUrl, elementType]);

  // --- Utility Functions ---
  const setPlaybackRate = useCallback((rate: number) => {
    const element = mediaElementRef.current;
    if (element) {
      element.playbackRate = rate;
      setPlaybackRateState(rate);
    }
  }, [mediaElementRef]);

  const toggleMute = useCallback(() => {
    const element = mediaElementRef.current;
    if (element) {
      const newMutedState = !element.muted;
      console.log(`%%% Playback (${elementType}): Toggling mute. Current: ${element.muted}, New: ${newMutedState}`);
      element.muted = newMutedState;
    }
  }, [mediaElementRef, elementType]);

  const handleSeek = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const element = mediaElementRef.current;
    if (element) {
      const seekTime = parseFloat(event.target.value);
      console.log(`%%% Playback (${elementType}): handleSeek - Seek target value: ${seekTime}`);
      if (!isNaN(seekTime)) {
        setCurrentTime(seekTime);
        if (!isSeeking) {
          setIsSeeking(true);
          isProgrammaticSeek.current = true;
        }

        const performSeek = () => {
            element.currentTime = seekTime;
            element.removeEventListener('seeked', seekedListener);
            isProgrammaticSeek.current = false;
            setIsSeeking(false);
             console.log(`%%% Playback (${elementType}): handleSeek - Seeked complete.`);
        };

        const seekedListener = () => {
           // No action needed here, just used for event removal
        };

        if (element.readyState >= 2 /* HAVE_CURRENT_DATA */) {
            console.log(`%%% Playback (${elementType}): handleSeek - ReadyState sufficient, seeking immediately.`);
            element.addEventListener('seeked', seekedListener);
            performSeek();
        } else {
            console.warn(`%%% Playback (${elementType}): handleSeek - Element not ready to seek, seek might be delayed or fail.`);
            setIsSeeking(false);
        }
      }
    }
  }, [mediaElementRef, isSeeking, elementType]);

  return {
    isPlaying,
    currentTime,
    duration,
    playbackRate,
    isSeeking,
    isMuted,
    autoplayFailed,
    setPlaybackRate,
    togglePlayPause,
    toggleMute,
    handleSeek,
    play,
    pause,
    setIsSeeking,
  };
} 