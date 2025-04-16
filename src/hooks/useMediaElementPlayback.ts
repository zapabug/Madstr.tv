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
  viewMode: 'imagePodcast' | 'videoPlayer';
  onEnded?: () => void;
  initialTime?: number;
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
  viewMode,
  onEnded,
  initialTime = 0,
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

    console.log(`useMediaElementPlayback: Effect triggered. New URL: ${currentItemUrl}, Mode: ${viewMode}, initialTime: ${initialTime}`);
    
    setIsPlaying(false);
    setIsMuted(true);
    mediaElement.muted = true;
    setAutoplayFailed(false);
    setCurrentTime(initialTime);
    setDuration(0);
    hasAttemptedPlayRef.current = false;
    initialPlaySuccessfulRef.current = false;

    const handleLoadedMetadata = () => {
      console.log("useMediaElementPlayback: Metadata loaded, duration:", mediaElement.duration);
      setDuration(mediaElement.duration);
      if (initialTime > 0 && Math.abs(mediaElement.currentTime - initialTime) > 1) {
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

    const handleCanPlay = async () => {
      console.log(`useMediaElementPlayback: Canplay event fired. ReadyState: ${mediaElement.readyState}`);
      if (
        viewMode === 'videoPlayer' && 
        !initialPlaySuccessfulRef.current && 
        !hasAttemptedPlayRef.current &&
        mediaElement.readyState >= 3
      ) {
        hasAttemptedPlayRef.current = true;
        try {
          console.log("useMediaElementPlayback: Attempting playback via handleCanPlay...");
          mediaElement.muted = false;
          await mediaElement.play();
          console.log("useMediaElementPlayback: Playback initiated successfully via handleCanPlay.");
        } catch (error: any) {
          console.warn("useMediaElementPlayback: Playback attempt failed in handleCanPlay:", error.name, error.message);
          setIsPlaying(false);
          mediaElement.muted = true;
          setIsMuted(true);
          setAutoplayFailed(true);
          initialPlaySuccessfulRef.current = false;
        }
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

    // Set the source *before* calling load()
    console.log(`useMediaElementPlayback: Setting src to ${currentItemUrl}`);
    mediaElement.src = currentItemUrl;

    console.log("useMediaElementPlayback: Explicitly calling load() for new source.");
    mediaElement.load();

    return () => {
      console.log("useMediaElementPlayback: Cleaning up listeners for", currentItemUrl);
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
  }, [currentItemUrl, mediaElementRef, onEnded, isSeeking, initialTime, viewMode]);

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

  const play = useCallback(async () => {
    const mediaElement = mediaElementRef.current;
    if (!mediaElement || !currentItemUrl) return;
    console.log(`useMediaElementPlayback: play() called`);
    if (mediaElement.muted) {
        console.log("useMediaElementPlayback: Unmuting before playing.");
        mediaElement.muted = false;
        setIsMuted(false);
    }
    try {
        await mediaElement.play();
    } catch (e) {
        console.error("useMediaElementPlayback: Error in play():", e);
        setAutoplayFailed(true);
        setIsPlaying(false);
        setIsMuted(true);
    }
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
    console.log(`useMediaElementPlayback: togglePlayPause called. Paused: ${mediaElement.paused}, Ended: ${mediaElement.ended}`);
    if (mediaElement.paused || mediaElement.ended) {
      play();
    } else {
      pause();
    }
  }, [mediaElementRef, currentItemUrl, play, pause]);

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