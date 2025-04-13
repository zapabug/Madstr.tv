import React, { useRef, useState, useEffect } from 'react';
import QRCode from 'react-qr-code';
import { useInactivityTimer } from '../hooks/useInactivityTimer';

interface VideoPlayerProps {
  url: string | null;
  posterNpub: string | null;
  onEnded: () => void;
  // Add other props as needed, e.g., eventId, createdAt for context?
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ url, posterNpub, onEnded }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false); // Start paused until play succeeds
  const mainContainerRef = useRef<HTMLDivElement>(null); // Ref for the main component container

  // --- Inactivity Hook ---
  const [isInactive, resetInactivityTimer] = useInactivityTimer(45000); // 45 seconds

  // Effect to attempt play when URL changes
  useEffect(() => {
    const videoElement = videoRef.current;
    if (videoElement && url) {
        console.log("VideoPlayer: URL changed, attempting to play", url);
        videoElement.load(); // Load new source
        videoElement.muted = false; // Ensure unmuted before attempting play
        setIsPlaying(false); // Assume paused until play succeeds

        const playPromise = videoElement.play();

        if (playPromise !== undefined) {
            playPromise.then(() => {
                // Play attempt succeeded
                console.log("VideoPlayer: play() promise resolved.");
                // ---> Check if browser forced mute <--- 
                if (videoElement.muted) {
                    console.warn("VideoPlayer: Playback started but was forced muted by browser. Pausing.");
                    videoElement.pause();
                    setIsPlaying(false); // Stay paused
                } else {
                    console.log("VideoPlayer: Playback started successfully with sound.");
                    setIsPlaying(true); // Playback is active and unmuted
                }
            }).catch(error => {
                // Play attempt failed (e.g., browser policy)
                console.warn("VideoPlayer: play() promise rejected:", error);
                videoElement.pause(); // Ensure paused
                setIsPlaying(false);
            });
        }
    } else {
        // No URL or element
        setIsPlaying(false);
        if (videoElement) videoElement.pause();
    }
    
    // Cleanup: pause on unmount or url change
    return () => {
        if (videoElement) {
            videoElement.pause();
            setIsPlaying(false);
        }
    }

  }, [url]);

  // Add useEffect for 'ended' event
  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    const handleVideoEnd = () => {
        console.log("VideoPlayer: Video ended, calling onEnded prop.");
        onEnded(); // Call the callback passed from App
    };

    videoElement.addEventListener('ended', handleVideoEnd);

    // Cleanup function to remove the event listener
    return () => {
        videoElement.removeEventListener('ended', handleVideoEnd);
    };
  }, [onEnded]); // Re-run if the onEnded callback changes

  // --- Effect to Add Global Listeners for Inactivity --- 
  useEffect(() => {
    const container = mainContainerRef.current;
    if (!container) return;

    const handleActivity = () => {
        // console.log("VideoPlayer Activity detected, resetting timer"); // Optional: for debugging
        resetInactivityTimer();
    };

    // Events that indicate activity
    const activityEvents: Array<keyof HTMLElementEventMap> = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'focus'];

    activityEvents.forEach(event => {
        // Use capture phase for focus to catch focus events on child elements reliably
        container.addEventListener(event, handleActivity, event === 'focus');
    });

    // Initial reset
    resetInactivityTimer();

    return () => {
      activityEvents.forEach(event => {
          // Ensure the listener being removed matches the one added (capture phase for focus)
          container.removeEventListener(event, handleActivity, event === 'focus');
      });
    };
    // Hook dependencies ensure this runs correctly
  }, [resetInactivityTimer]); 

  const handlePlayPause = () => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    if (isPlaying) {
        // Pause action
        videoElement.pause();
        setIsPlaying(false);
        console.log("VideoPlayer: Paused manually.");
    } else {
        // Play action
        console.log("VideoPlayer: Attempting manual play...");
        // ---> Ensure unmuted before manual play <--- 
        videoElement.muted = false;
        const playPromise = videoElement.play();
        if (playPromise !== undefined) {
             playPromise.then(() => {
                console.log("VideoPlayer: Manual play succeeded.");
                // Check if muted again, although unlikely for manual play
                if (videoElement.muted) {
                    console.warn("VideoPlayer: Manual play started but browser forced mute unexpectedly.");
                    videoElement.pause();
                    setIsPlaying(false);
                } else {
                    setIsPlaying(true);
                }
            }).catch(error => {
                console.error("VideoPlayer: Manual play failed:", error);
                setIsPlaying(false);
            });
        }
    }
  };

  if (!url) {
    return (
      <div className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden">
        <p className="text-gray-400">No video selected.</p>
      </div>
    );
  }

  return (
    <div 
        ref={mainContainerRef} // Add ref
        className="relative w-full h-full bg-black flex flex-col items-center justify-center overflow-hidden"
        // Listeners are now added via useEffect
    >
      {/* Video Element - set muted={false} */}
      <video 
        ref={videoRef}
        key={url} 
        src={url}
        // Remove loop attribute to allow 'ended' event to fire naturally
        // loop 
        // Muted state is now controlled by useEffect/handlePlayPause
        // muted={false} 
        // autoPlay // Let useEffect handle play attempt
        className={`object-contain w-full h-full`} 
        onError={(e) => console.error("Video source error:", e)}
      />

      {/* Controls Overlay - Apply fade effect */} 
      <div 
          className={`absolute bottom-4 right-24 md:right-28 lg:right-32 z-10 flex space-x-4 p-1 transition-opacity duration-500 ease-in-out ${isInactive ? 'opacity-20' : 'opacity-100'}`}
      > 
        {/* Play/Pause Button */}
        <button 
            onClick={handlePlayPause} 
            // Keep styling, but remove bg-opacity?
            className="p-1 bg-transparent border-none text-purple-400 hover:text-purple-200 focus:text-purple-200 focus:outline-none transition-colors duration-150"
            aria-label={isPlaying ? "Pause" : "Play"}
        >
             {isPlaying ? 
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> 
                : 
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            }
        </button>
      </div>

      {/* QR Code - Optionally fade this too? Or keep it visible? Let's keep it for now */}
      {posterNpub && (
          <div className="absolute bottom-2 right-2 md:bottom-4 md:right-4 z-20 bg-white p-1 rounded w-12 h-12 md:w-16 md:h-16 lg:w-20 lg:h-20">
              <QRCode
              value={`nostr:${posterNpub}`}
              size={256}
              style={{ height: "auto", maxWidth: "100%", width: "100%" }}
              viewBox={`0 0 256 256`}
              level="L"
              />
          </div>
      )}
    </div>
  );
};

export default VideoPlayer; 