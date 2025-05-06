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
  preloadMediaElementRef?: React.RefObject<HTMLMediaElement>;
  currentItemUrl: string | null;
  preloadItemUrl?: string | null;
  viewMode: 'imagePodcast' | 'videoPlayer';
  onEnded?: () => void;
  initialTime?: number;
  autoPlayNext?: boolean;
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
  preloadMediaElementRef,
  currentItemUrl,
  preloadItemUrl,
  viewMode,
  onEnded,
  initialTime = 0,
  autoPlayNext = false,
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
      setIsMuted(true);
      setAutoplayFailed(false);
      setCurrentTime(0);
      setDuration(0);
      hasAttemptedPlayRef.current = false;
      initialPlaySuccessfulRef.current = false;
      return;
    }

    console.log(`useMediaElementPlayback: Main media effect. New URL: ${currentItemUrl}, Mode: ${viewMode}, initialTime: ${initialTime}, autoPlayNext: ${autoPlayNext}`);
    
    setIsPlaying(false);
    setIsMuted(true);
    mediaElement.muted = true;
    setAutoplayFailed(false);
    setCurrentTime(0);
    setDuration(0);
    hasAttemptedPlayRef.current = false;
    initialPlaySuccessfulRef.current = false;
    lastSaveTimeRef.current = 0;

    const savedTime = getPlaybackTime(currentItemUrl);
    const effectiveInitialTime = savedTime !== null ? savedTime : initialTime;
    console.log(`useMediaElementPlayback: For ${currentItemUrl}, savedTime: ${savedTime}, propInitialTime: ${initialTime}, effectiveInitialTime: ${effectiveInitialTime}`);

    const handleLoadedMetadata = () => {
      console.log("useMediaElementPlayback: Metadata loaded, duration:", mediaElement.duration);
      setDuration(mediaElement.duration);
      if (effectiveInitialTime > 0 && Math.abs(mediaElement.currentTime - effectiveInitialTime) > 0.5) {
        console.log(`Applying effectiveInitialTime for ${currentItemUrl} to ${effectiveInitialTime}`);
        isProgrammaticSeek.current = true;
        mediaElement.currentTime = effectiveInitialTime;
      } else {
        setCurrentTime(mediaElement.currentTime);
      }
      if (autoPlayNext || (viewMode === 'videoPlayer' && !initialPlaySuccessfulRef.current)) {
        console.log(`useMediaElementPlayback: Attempting to play in handleLoadedMetadata. autoPlayNext: ${autoPlayNext}, viewMode: ${viewMode}`);
        mediaElement.muted = isMuted;
        mediaElement.play().then(() => {
            console.log("useMediaElementPlayback: Play initiated from handleLoadedMetadata.");
        }).catch(error => {
            console.warn("useMediaElementPlayback: Autoplay failed in handleLoadedMetadata:", error);
            setAutoplayFailed(true);
            setIsPlaying(false);
        });
      }
    };

    const handleTimeUpdate = () => {
      if (!isSeeking) {
        setCurrentTime(mediaElement.currentTime);
      }
      if (isProgrammaticSeek.current && Math.abs(mediaElement.currentTime - effectiveInitialTime) < 0.5) {
         isProgrammaticSeek.current = false;
      }
      const now = Date.now();
      if (currentItemUrl && isPlaying && now - lastSaveTimeRef.current > SAVE_INTERVAL && !mediaElement.seeking && mediaElement.currentTime > 0) {
          savePlaybackTime(currentItemUrl, mediaElement.currentTime);
          lastSaveTimeRef.current = now;
      }
    };

    const handlePlay = () => {
      console.log("useMediaElementPlayback: Play event fired.");
      setIsPlaying(true);
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
      if (currentItemUrl) savePlaybackTime(currentItemUrl, 0);

      if (onEnded) {
        console.log("useMediaElementPlayback: Calling onEnded callback.");
        onEnded();
      }
    };

    const handleRateChange = () => setPlaybackRateState(mediaElement.playbackRate);

    const handleVolumeChange = () => {
      console.log("useMediaElementPlayback: VolumeChange event fired. Muted:", mediaElement.muted);
      setIsMuted(mediaElement.muted);
    };

    mediaElement.addEventListener('loadedmetadata', handleLoadedMetadata);
    mediaElement.addEventListener('timeupdate', handleTimeUpdate);
    mediaElement.addEventListener('play', handlePlay);
    mediaElement.addEventListener('pause', handlePause);
    mediaElement.addEventListener('ended', handleEnded);
    mediaElement.addEventListener('ratechange', handleRateChange);
    mediaElement.addEventListener('volumechange', handleVolumeChange);

    if (mediaElement.src !== currentItemUrl) {
        console.log(`useMediaElementPlayback: Setting mediaElement.src to ${currentItemUrl}`);
        mediaElement.src = currentItemUrl;
        mediaElement.load();
    }

    return () => {
      console.log("useMediaElementPlayback: Cleaning up main media event listeners for URL:", currentItemUrl);
      mediaElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
      mediaElement.removeEventListener('timeupdate', handleTimeUpdate);
      mediaElement.removeEventListener('play', handlePlay);
      mediaElement.removeEventListener('pause', handlePause);
      mediaElement.removeEventListener('ended', handleEnded);
      mediaElement.removeEventListener('ratechange', handleRateChange);
      mediaElement.removeEventListener('volumechange', handleVolumeChange);
      
      if (!mediaElement.paused) {
         console.log("useMediaElementPlayback: Pausing media during cleanup.");
         mediaElement.pause();
      }
    };
  }, [currentItemUrl, viewMode, initialTime, onEnded, mediaElementRef, autoPlayNext, isMuted]);

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

  const play = useCallback(() => {
    const mediaElement = mediaElementRef.current;
    if (mediaElement && (mediaElement.paused || mediaElement.ended) && currentItemUrl) {
      hasAttemptedPlayRef.current = true;
      mediaElement.play().catch(error => {
        console.warn("useMediaElementPlayback: Error on play():", error);
        setAutoplayFailed(true);
        setIsPlaying(false);
      });
    }
  }, [mediaElementRef, currentItemUrl]);

  const pause = useCallback(() => {
    const mediaElement = mediaElementRef.current;
    if (mediaElement && !mediaElement.paused) {
      mediaElement.pause();
    }
  }, [mediaElementRef]);

  const togglePlayPause = useCallback(() => {
    const mediaElement = mediaElementRef.current;
    if (!mediaElement || !currentItemUrl) {
        console.warn("useMediaElementPlayback: togglePlayPause called with invalid state.", 
                     { hasMediaElement: !!mediaElement, hasCurrentItemUrl: !!currentItemUrl });
        return;
    }
    
    hasAttemptedPlayRef.current = true;

    if (mediaElement.paused || mediaElement.ended) {
      console.log("useMediaElementPlayback: togglePlayPause - Calling play()");
      mediaElement.play().catch(error => {
        console.warn("useMediaElementPlayback: Error on play() in togglePlayPause:", error);
        setAutoplayFailed(true);
        setIsPlaying(false);
      });
    } else {
      console.log("useMediaElementPlayback: togglePlayPause - Calling pause()");
      mediaElement.pause();
    }
  }, [mediaElementRef, currentItemUrl]);

  const toggleMute = useCallback(() => {
    const mediaElement = mediaElementRef.current;
    if (mediaElement) {
      mediaElement.muted = !mediaElement.muted;
      console.log("useMediaElementPlayback: Toggled mute to", mediaElement.muted);
    }
  }, [mediaElementRef]);

  const handleSeek = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const mediaElement = mediaElementRef.current;
    if (mediaElement) {
      const time = parseFloat(event.target.value);
      isProgrammaticSeek.current = true;
      mediaElement.currentTime = time;
      setCurrentTime(time);
      if (currentItemUrl) savePlaybackTime(currentItemUrl, time);
    }
  }, [mediaElementRef, currentItemUrl]);

  const setPlaybackRate = useCallback((rate: number) => {
    const mediaElement = mediaElementRef.current;
    if (mediaElement) {
      mediaElement.playbackRate = rate;
    }
  }, [mediaElementRef]);

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