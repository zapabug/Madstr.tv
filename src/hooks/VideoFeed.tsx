import React, { useRef, useState, useEffect } from 'react';
import QRCode from 'react-qr-code';
import { useInactivityTimer } from '../hooks/useInactivityTimer';
import { useMediaElementPlayback } from '../hooks/useMediaElementPlayback';

// --- Helper to format time (seconds) into MM:SS ---
const formatTime = (seconds: number): string => {
    if (isNaN(seconds) || !isFinite(seconds)) {
        return '00:00';
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    const formattedMinutes = String(minutes).padStart(2, '0');
    const formattedSeconds = String(remainingSeconds).padStart(2, '0');
    return `${formattedMinutes}:${formattedSeconds}`;
};

// <<< Rename VideoPlayerProps to VideoFeedProps >>>
interface VideoFeedProps {
  url: string | null;
  posterNpub: string | null;
  onEnded: () => void;
  interactiveMode: 'podcast' | 'video';
  toggleInteractiveMode: () => void;
  appIsPlayingRequest: boolean;
  onVideoPlayingStateChange: (isPlaying: boolean) => void;
  // Add other props as needed, e.g., eventId, createdAt for context?
}

// <<< Rename VideoPlayer to VideoFeed and use VideoFeedProps >>>
const VideoFeed: React.FC<VideoFeedProps> = ({ url, posterNpub, onEnded, interactiveMode, toggleInteractiveMode, appIsPlayingRequest, onVideoPlayingStateChange }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mainContainerRef = useRef<HTMLDivElement>(null);
  const playPauseButtonRef = useRef<HTMLButtonElement>(null);
  const progressBarRef = useRef<HTMLInputElement>(null);
  const speedButtonRef = useRef<HTMLButtonElement>(null);
  const toggleButtonRef = useRef<HTMLButtonElement>(null);

  // --- Custom Hooks ---
  const [isInactive, resetInactivityTimer] = useInactivityTimer(5000);
  const {
    isPlaying: internalIsPlaying,
    currentTime,
    duration,
    togglePlayPause,
    handleSeek,
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
        console.log(`VideoFeed: App requested play=${appIsPlayingRequest}, current=${internalIsPlaying}. Triggering toggle.`);
        togglePlayPause();
    }
  }, [appIsPlayingRequest, internalIsPlaying, togglePlayPause]);

  // --- Effect to Add Global Listeners for Inactivity ---
  useEffect(() => {
    const container = mainContainerRef.current;
    if (!container) return;

    const handleActivity = () => {
        // console.log("VideoFeed Activity detected, resetting timer");
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
      if (container) {
          activityEvents.forEach(event => {
              // Ensure the listener being removed matches the one added (capture phase for focus)
              container.removeEventListener(event, handleActivity, event === 'focus');
          });
      }
    };
    // Hook dependencies ensure this runs correctly
  }, [resetInactivityTimer]);

  // --- KeyDown Handlers for Controls ---
  const handlePlayPauseKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
          togglePlayPause();
          event.preventDefault();
          return;
      }
      if (event.key === 'ArrowRight') {
          progressBarRef.current?.focus();
          event.preventDefault();
          return;
      }
      // Navigate Left from Play/Pause wraps to Speed Button
      if (event.key === 'ArrowLeft') {
           speedButtonRef.current?.focus();
           event.preventDefault();
           return;
      }
  };

  const handleSeekBarKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
      // Allow native seek
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          // Adjust focus based on direction within seekbar
          if (event.key === 'ArrowLeft') {
              playPauseButtonRef.current?.focus();
              event.preventDefault();
          } else { // ArrowRight
              speedButtonRef.current?.focus();
              event.preventDefault();
          }
          return; 
      }
      // Navigate Down/Up (Currently no standard target)
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
           event.preventDefault(); // Prevent default scroll
      }
  };

  const handleSpeedButtonKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
          console.log("VideoFeed: Speed button activated (no action).");
          event.preventDefault();
          return;
      }
      // Navigate Left to Seek Bar
      if (event.key === 'ArrowLeft') {
          progressBarRef.current?.focus();
          event.preventDefault();
          return;
      }
      // Navigate Right to Mode Toggle Button
      if (event.key === 'ArrowRight') {
          toggleButtonRef.current?.focus();
          event.preventDefault();
          return;
      }
  };

  // <<< Add KeyDown for Toggle Button >>>
  const handleToggleButtonKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
       if (event.key === 'Enter' || event.key === ' ') {
          toggleInteractiveMode();
          event.preventDefault();
          return;
       }
       // Navigate Left to Speed Button
       if (event.key === 'ArrowLeft') {
           speedButtonRef.current?.focus();
           event.preventDefault();
           return;
       }
       // No standard Right/Up/Down navigation from here
       if (event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault();
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
        ref={mainContainerRef}
        className="relative w-full h-full bg-black flex flex-col items-center justify-center overflow-hidden"
    >
      {/* Video Element - Add autoPlay, remove explicit muted */}
      <video
        ref={videoRef}
        key={url}
        src={url}
        className={`object-contain w-full h-full`}
        onError={(e) => console.error("Video source error:", e)}
        onEnded={onEnded}
        autoPlay
      />

      {/* Controls Overlay - Positioned bottom, fades */}
      <div
          className={`absolute bottom-0 left-0 right-0 z-10 p-2 transition-opacity duration-500 ease-in-out ${isInactive ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
          aria-hidden={isInactive}
      >
         {/* Wrapper REMOVED */}
         {/* <div className="relative w-full h-16"> */}

            {/* REPLICATED Podcastr controls - Positioned absolutely bottom-right */}
            <div
                className="absolute bottom-2 right-2 flex flex-row items-center justify-between bg-black bg-opacity-70 rounded p-1 max-w-xs md:max-w-sm lg:max-w-md z-20"
            >
                {/* Play/Pause Button (Podcastr Style) */}
                <button
                    ref={playPauseButtonRef}
                    onClick={togglePlayPause}
                    onKeyDown={handlePlayPauseKeyDown}
                    className="flex-shrink-0 p-1 rounded-md text-purple-500 bg-blue-700 hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-1 focus:ring-offset-black transition-colors duration-150"
                    aria-label={internalIsPlaying ? "Pause" : "Play"}
                    tabIndex={0}
                >
                    {/* SVG Icons */} 
                    {internalIsPlaying ? (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" /></svg>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" /></svg>
                    )}
                </button>
                {/* Seek Bar Area (Podcastr Style) */}
                <div className="flex-grow flex items-center justify-center mx-2">
                    <span className="text-xs text-gray-300 w-10 text-right mr-2 flex-shrink-0">{formatTime(currentTime)}</span>
                    <input
                        ref={progressBarRef}
                        type="range"
                        min={0}
                        max={duration || 100}
                        value={currentTime}
                        onChange={handleSeek}
                        className="w-full h-1 bg-purple-600 rounded-lg appearance-none cursor-pointer accent-purple-500 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-1 focus:ring-offset-black"
                        aria-label="Seek through video"
                        tabIndex={0}
                        disabled={!duration || duration <= 0}
                        onKeyDown={handleSeekBarKeyDown}
                    />
                    <span className="text-xs text-gray-300 w-10 text-left ml-2 flex-shrink-0">{formatTime(duration)}</span>
                </div>
                {/* "Speed" Button Area (Podcastr Style) */}
                <div className="relative flex-shrink-0">
                    <button
                        ref={speedButtonRef}
                        onKeyDown={handleSpeedButtonKeyDown}
                        className="p-1 text-purple-400 bg-purple-700 hover:bg-purple-600 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-1 focus:ring-offset-black transition-colors duration-150 text-xs"
                        aria-label="Playback speed (Not functional)"
                        tabIndex={0}
                    >
                        1.00x
                    </button>
                </div>
            </div>

            {/* Mode Toggle Button - Positioned absolutely */}
            <button
                 ref={toggleButtonRef}
                 onClick={toggleInteractiveMode}
                 onKeyDown={handleToggleButtonKeyDown}
                 tabIndex={0}
                 className="absolute bottom-2 right-48 md:right-56 lg:right-64 z-30 p-1 bg-black bg-opacity-60 rounded 
                            text-purple-400 hover:text-purple-200 
                            focus:text-purple-100 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-75
                            transition-all duration-150 text-xs font-semibold uppercase"
                 aria-label={'Show Podcasts'}
                 title={'Show Podcasts'}
             >
                 Podcasts
             </button>

         {/* </div> */}
      </div>

      {/* QR Code - Adjusted position */}
      {posterNpub && (
          <div className="absolute bottom-16 right-4 md:bottom-16 md:right-8 z-20 bg-white p-1 rounded w-12 h-12 md:w-16 md:h-16 lg:w-20 lg:h-20 transition-opacity duration-500 ease-in-out ${isInactive ? 'opacity-20' : 'opacity-100'}">
              <QRCode
                value={`nostr:${posterNpub}`}
                size={256}
                style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                viewBox={`0 0 256 256`}
                level="L"
              />
          </div>
      )}

      {/* Mode Toggle Button (Bottom Right, distinct from controls) */}
      <button
          ref={toggleButtonRef}
          onClick={toggleInteractiveMode}
          onKeyDown={handleToggleButtonKeyDown}
          className={`absolute bottom-2 left-2 z-20 p-1 rounded-md text-xs transition-opacity duration-500 ease-in-out ${isInactive ? 'opacity-0 pointer-events-none' : 'opacity-100'} ${interactiveMode === 'video' ? 'bg-blue-600 text-white' : 'bg-gray-600 text-gray-300'} hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-1 focus:ring-offset-black`}
          aria-label="Switch to Podcast Mode"
          tabIndex={0}
      >
          {interactiveMode === 'video' ? 'Podcasts' : 'Videos'}
      </button>

    </div>
  );
};

// <<< Update export >>>
export default VideoFeed; 