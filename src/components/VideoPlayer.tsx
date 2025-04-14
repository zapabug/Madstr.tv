import React, { useRef, useState, useEffect } from 'react';
import QRCode from 'react-qr-code';
import { useInactivityTimer } from '../hooks/useInactivityTimer';
import { useMediaElementPlayback } from '../hooks/useMediaElementPlayback';

interface VideoPlayerProps {
  url: string | null;
  posterNpub: string | null;
  onEnded: () => void;
  interactiveMode: 'podcast' | 'video';
  toggleInteractiveMode: () => void;
  appIsPlayingRequest: boolean;
  onVideoPlayingStateChange: (isPlaying: boolean) => void;
  // Add other props as needed, e.g., eventId, createdAt for context?
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ url, posterNpub, onEnded, interactiveMode, toggleInteractiveMode, appIsPlayingRequest, onVideoPlayingStateChange }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mainContainerRef = useRef<HTMLDivElement>(null);

  // --- Custom Hooks ---
  const [isInactive, resetInactivityTimer] = useInactivityTimer(45000);
  const { 
    isPlaying: internalIsPlaying,
    togglePlayPause,
  } = useMediaElementPlayback({
    mediaRef: videoRef as React.RefObject<HTMLAudioElement | HTMLVideoElement>,
    currentItemUrl: url,
    onEnded: onEnded,
  });

  // --- Effects for Play/Pause state communication ---
  useEffect(() => {
    onVideoPlayingStateChange(internalIsPlaying);
  }, [internalIsPlaying, onVideoPlayingStateChange]);

  useEffect(() => {
    if (appIsPlayingRequest !== internalIsPlaying) {
        console.log(`VideoPlayer: App requested play=${appIsPlayingRequest}, current=${internalIsPlaying}. Triggering toggle.`);
        togglePlayPause();
    }
  }, [appIsPlayingRequest, internalIsPlaying, togglePlayPause]);

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

  if (!url) {
    return (
      <div className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden">
        <p className="text-gray-400">No video selected.</p>
      </div>
    );
  }

  return (
    <div 
        ref={mainContainerRef}
        className="relative w-full h-full bg-black flex flex-col items-center justify-center overflow-hidden"
    >
      {/* Video Element - set muted={false} */}
      <video 
        ref={videoRef}
        key={url} 
        src={url}
        className={`object-contain w-full h-full`} 
        onError={(e) => console.error("Video source error:", e)}
      />

      {/* Controls Overlay - Apply fade effect */}
      <div 
          className={`absolute bottom-4 right-24 md:right-28 lg:right-32 z-10 flex items-center p-1 transition-opacity duration-500 ease-in-out ${isInactive ? 'opacity-20' : 'opacity-100'}`}
      > 
        <button 
            onClick={toggleInteractiveMode}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                toggleInteractiveMode();
                e.preventDefault();
              }
            }}
            tabIndex={0}
            className="p-1 bg-black bg-opacity-60 rounded 
                       text-purple-400 hover:text-purple-200 
                       focus:text-purple-100 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-75
                       transition-all duration-150 text-xs font-semibold uppercase"
            aria-label={interactiveMode === 'podcast' ? 'Show Video List' : 'Show Podcasts'}
            title={interactiveMode === 'podcast' ? 'Show Video List' : 'Show Podcasts'}
        >
            {interactiveMode === 'podcast' ? 'Videos' : 'Podcasts'}
        </button>
      </div>

      {/* QR Code - Optionally fade this too? Or keep it visible? Let's keep it for now */}
      {posterNpub && (
          <div className="absolute bottom-2 right-4 md:bottom-4 md:right-8 z-20 bg-white p-1 rounded w-12 h-12 md:w-16 md:h-16 lg:w-20 lg:h-20">
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