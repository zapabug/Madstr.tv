import { useState, useCallback, RefObject, useEffect } from 'react';

interface UseVideoPlaybackArgs {
  videoRef: RefObject<HTMLVideoElement | null>;
  url: string | null;
  onPlayAttempt?: () => void;
  onPause?: () => void;
  onPlaySuccess?: () => void;
  onPlayError?: (error: any) => void;
  onEnded?: () => void;
}

interface UseVideoPlaybackReturn {
  isPlaying: boolean;
  togglePlayPause: () => void;
  handleKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
}

export const useVideoPlayback = ({
  videoRef,
  url,
  onPlayAttempt,
  onPause,
  onPlaySuccess,
  onPlayError,
  onEnded,
}: UseVideoPlaybackArgs): UseVideoPlaybackReturn => {
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (videoElement && url) {
        console.log("useVideoPlayback: URL changed, attempting to play", url);
        videoElement.load();
        videoElement.muted = false;
        setIsPlaying(false);
        onPlayAttempt?.();

        const playPromise = videoElement.play();

        if (playPromise !== undefined) {
            playPromise.then(() => {
                console.log("useVideoPlayback: Auto-play promise resolved.");
                if (videoElement.muted) {
                    console.warn("useVideoPlayback: Auto-playback started but was forced muted. Pausing.");
                    videoElement.pause();
                    setIsPlaying(false);
                    onPause?.();
                } else {
                    console.log("useVideoPlayback: Auto-playback started successfully.");
                    setIsPlaying(true);
                    onPlaySuccess?.();
                }
            }).catch(error => {
                console.warn("useVideoPlayback: Auto-play promise rejected:", error);
                videoElement.pause();
                setIsPlaying(false);
                onPlayError?.(error);
            });
        }
    } else {
        setIsPlaying(false);
        if (videoElement) videoElement.pause();
    }

    return () => {
        if (videoElement) {
            videoElement.pause();
            setIsPlaying(false);
        }
    }
  }, [url, videoRef, onPlayAttempt, onPause, onPlaySuccess, onPlayError]);

  useEffect(() => {
      const videoElement = videoRef.current;
      if (!videoElement) return;

      const handleVideoEnd = () => {
          console.log("useVideoPlayback: Video ended.");
          setIsPlaying(false);
          onEnded?.();
      };

      videoElement.addEventListener('ended', handleVideoEnd);

      return () => {
          videoElement.removeEventListener('ended', handleVideoEnd);
      };
  }, [videoRef, onEnded]);

  const togglePlayPause = useCallback(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    if (isPlaying) {
      videoElement.pause();
      setIsPlaying(false);
      onPause?.();
      console.log("useVideoPlayback: Paused manually.");
    } else {
      console.log("useVideoPlayback: Attempting manual play...");
      videoElement.muted = false;
      onPlayAttempt?.();
      const playPromise = videoElement.play();

      if (playPromise !== undefined) {
        playPromise.then(() => {
          console.log("useVideoPlayback: Manual play succeeded.");
          if (videoElement.muted) {
            console.warn("useVideoPlayback: Manual play started but browser forced mute unexpectedly. Pausing.");
            videoElement.pause();
            setIsPlaying(false);
            onPause?.();
          } else {
            setIsPlaying(true);
            onPlaySuccess?.();
          }
        }).catch(error => {
          console.error("useVideoPlayback: Manual play failed:", error);
          setIsPlaying(false);
          onPlayError?.(error);
        });
      }
    }
  }, [videoRef, isPlaying, onPlayAttempt, onPause, onPlaySuccess, onPlayError]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      togglePlayPause();
      event.preventDefault();
    }
  }, [togglePlayPause]);

  return { isPlaying, togglePlayPause, handleKeyDown };
}; 