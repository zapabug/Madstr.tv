import { useEffect, useCallback, useRef, useState, useMemo } from 'react';
import ndkInstance from './ndk'; // <-- Import the singleton NDK instance
import ImageFeed from './components/ImageFeed';
import MessageBoard from './components/MessageBoard';
import MediaPanel from './components/MediaPanel';
import RelayStatus from './components/RelayStatus';
import VideoPlayer from './components/VideoPlayer';
import { MAIN_THREAD_NEVENT_URI, RELAYS } from './constants';
import { useMediaState } from './hooks/useMediaState';
import { useMediaElementPlayback } from './hooks/useMediaElementPlayback';
import { useFullscreen } from './hooks/useFullscreen';
import { useKeyboardControls } from './hooks/useKeyboardControls';
import { useImageCarousel } from './hooks/useImageCarousel';
import { useNDK, useNDKInit } from '@nostr-dev-kit/ndk-hooks';
import { NostrNote } from './types/nostr';
import { motion, AnimatePresence } from 'framer-motion';
import SettingsModal from './components/SettingsModal';
import { useAuth } from './hooks/useAuth';
import { useMediaContent } from './hooks/useMediaContent';
import { nip19 } from 'nostr-tools'; // <-- Re-added nip19 import

// Fullscreen Timeouts
const INTERACTION_TIMEOUT = 30000; // 30 seconds
const MESSAGE_TIMEOUT = 120000; // 2 minutes
const CHECK_INTERVAL = 5000; // Check every 5 seconds

// --- Constants ---
const IMAGE_CAROUSEL_INTERVAL = 45000; // 45 seconds

function App() {
  // --- Call ALL Hooks Unconditionally at the Top --- 
  const initNDK = useNDKInit(); 
  const { ndk } = useNDK(); 
  console.log("[App.tsx] Value of ndk from useNDK():", ndk);
  const auth = useAuth(); 
  const { followedTags, currentUserNpub } = auth;

  // --- Initialize NDK Directly --- 
  // Remove the useEffect later in the file that did this.
  initNDK(ndkInstance);
  console.log("App.tsx: Called initNDK(ndkInstance) directly.");

  // --- Media Content Hook --- 
  const { 
      shuffledImageNotes,
      shuffledVideoNotes,
      podcastNotes,
      fetchOlderImages,
      fetchOlderVideos,
      // Add loading states if needed for UI
      isLoadingKind3, 
      isLoadingImages,
      isLoadingVideos,
      isLoadingPodcasts 
  } = useMediaContent({ followedTags, currentUserNpub });

  // --- State for Podcast Initial Time (if needed) --- 
  const [initialPodcastTime] = useState<number>(0);

  // --- Media Refs --- 
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const imageFeedRef = useRef<HTMLDivElement>(null);

  // --- UI State & Playback Hooks --- 
  const { 
      viewMode, 
      currentImageIndex, 
      currentPodcastIndex, 
      currentVideoIndex, 
      currentItemUrl, 
      handleVideoSelect, 
      handlePrevious, 
      handleNext, 
      setViewMode, 
      setCurrentPodcastIndex 
  } = useMediaState({
      initialImageNotes: shuffledImageNotes,
      initialPodcastNotes: podcastNotes, 
      initialVideoNotes: shuffledVideoNotes,
      fetchOlderImages: fetchOlderImages,
      fetchOlderVideos: fetchOlderVideos, 
      shuffledImageNotesLength: shuffledImageNotes.length, 
      shuffledVideoNotesLength: shuffledVideoNotes.length,
  });

  // --- Derive currentNoteId --- 
  const currentNoteId = useMemo(() => {
    if (viewMode === 'imagePodcast' && shuffledImageNotes[currentImageIndex]) {
        return shuffledImageNotes[currentImageIndex].id;
    } else if (viewMode === 'videoPlayer' && shuffledVideoNotes[currentVideoIndex]) {
        return shuffledVideoNotes[currentVideoIndex].id;
    }
    return null; // Return null if no note is active
  }, [viewMode, currentImageIndex, currentVideoIndex, shuffledImageNotes, shuffledVideoNotes]);

  const activeMediaRef = viewMode === 'videoPlayer' ? videoRef : audioRef;

  const { 
      isPlaying, 
      currentTime, 
      duration, 
      playbackRate, 
      setPlaybackRate, 
      togglePlayPause, 
      handleSeek, 
      play, 
      pause, 
      isSeeking, 
      setIsSeeking, 
      isMuted, 
      autoplayFailed,
      toggleMute 
  } = useMediaElementPlayback({
      mediaElementRef: activeMediaRef,
      currentItemUrl,
      viewMode,
      onEnded: handleNext,
      initialTime: viewMode === 'imagePodcast' ? initialPodcastTime : 0,
  });

  // --- Fullscreen Hook --- 
  const { isFullScreen, signalInteraction, signalMessage } = useFullscreen({
      interactionTimeout: INTERACTION_TIMEOUT,
      messageTimeout: MESSAGE_TIMEOUT,
      checkInterval: CHECK_INTERVAL,
  });

  // --- Keyboard Controls Hook --- 
  const focusImageFeedToggle = useCallback(() => {
      imageFeedRef.current?.focus();
  }, []);

  useKeyboardControls({
      isFullScreen,
      signalInteraction,
      onSetViewMode: setViewMode,
      onTogglePlayPause: togglePlayPause,
      onNext: handleNext,
      onPrevious: handlePrevious,
      onFocusToggle: viewMode === 'imagePodcast' ? focusImageFeedToggle : undefined,
      viewMode,
  });

  // --- Image Carousel Hook --- 
  useImageCarousel({
      isActive: viewMode === 'imagePodcast' && isPlaying,
      onTick: handleNext,
      intervalDuration: IMAGE_CAROUSEL_INTERVAL,
  });

  // --- Settings Modal State --- 
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // --- Render Logic --- 
  // Determine overall loading state (optional, could show spinners per section)
  const isLoadingContent = isLoadingKind3 || isLoadingImages || isLoadingVideos || isLoadingPodcasts;

  // Calculate Relay Status Props
  const relayStatusProps = useMemo(() => ({
      isReceivingData: !!ndk?.pool?.connectedRelays?.().length, // Check if any relays are connected
      relayCount: ndk?.pool?.relays?.size ?? RELAYS.length, // Use NDK pool size or fallback to constant
  }), [ndk]);

  // --- Conditional Return for NDK Readiness (AFTER all hooks) ---
  if (!ndk) {
    console.log("App.tsx: Conditional render - NDK is not ready yet."); // Added log
    return (
      <div className="relative flex flex-col min-h-screen h-screen text-white border-2 border-purple-900 bg-gradient-radial from-gray-900 via-black to-black items-center justify-center">
        <div className="mb-4 w-16 h-16 animate-spin border-4 border-purple-600 border-t-transparent rounded-full"></div>
        <p className="animate-pulse">Initializing Nostr Connection...</p>
      </div>
    );
  }

  // --- Main Render (NDK is ready) --- 
  console.log("App.tsx: NDK instance is ready, rendering main app.");

  return (
    <div className={`flex flex-col h-screen overflow-hidden bg-black text-white relative ${isFullScreen ? '' : 'p-4 border-8 border-gray-800'}`}>
      {/* Invisible Audio Player */}
      <audio ref={audioRef} src={viewMode === 'imagePodcast' ? (currentItemUrl ?? undefined) : undefined} preload="auto" />

      {/* Main Content Area */}
      <div className="flex-grow flex flex-col overflow-hidden">
        <AnimatePresence mode="wait">
          {viewMode === 'imagePodcast' && (
            <motion.div
              key="imageFeed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
              className="flex-grow overflow-hidden"
            >
              <ImageFeed
                currentImageIndex={currentImageIndex}
                imageNotes={shuffledImageNotes}
              />
            </motion.div>
          )}

          {viewMode === 'videoPlayer' && (
            <motion.div
              key="videoPlayer"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
              className="flex-grow overflow-hidden"
            >
              <VideoPlayer
                videoRef={videoRef}
                src={currentItemUrl}
                isPlaying={isPlaying}
                togglePlayPause={togglePlayPause}
                autoplayFailed={autoplayFailed}
                isMuted={isMuted}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom Panel (Hidden in Fullscreen) */}
      {!isFullScreen && (
        <motion.div
          className="h-1/3 flex flex-row mt-2"
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={{ type: 'spring', stiffness: 100, damping: 20 }}
        >
          <div className="w-2/3 pr-2 h-full overflow-hidden">
            <MessageBoard
              neventToFollow={MAIN_THREAD_NEVENT_URI}
              onNewMessage={signalMessage}
            />
          </div>
          <div className="w-1/3 pl-2 h-full overflow-hidden">
            <MediaPanel
              viewMode={viewMode}
              audioRef={audioRef}
              videoRef={videoRef}
              podcastNotes={podcastNotes}
              videoNotes={shuffledVideoNotes}
              currentPodcastIndex={currentPodcastIndex}
              currentVideoIndex={currentVideoIndex}
              onVideoSelect={handleVideoSelect}
              setCurrentPodcastIndex={setCurrentPodcastIndex}
              isPlaying={isPlaying}
              currentTime={currentTime}
              duration={duration}
              togglePlayPause={togglePlayPause}
              handleSeek={handleSeek}
              playbackRate={playbackRate}
              setPlaybackRate={setPlaybackRate}
              setViewMode={setViewMode}
              currentItemUrl={currentItemUrl}
            />
          </div>
        </motion.div>
      )}

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      {/* Relay Status / Settings Button */}
      {!isFullScreen && (
        <div className="absolute bottom-0 right-0 mb-1 mr-1 z-50">
          <RelayStatus 
            onSettingsClick={() => setIsSettingsOpen(true)} 
            isReceivingData={relayStatusProps.isReceivingData}
            relayCount={relayStatusProps.relayCount}
          />
        </div>
      )}

      {/* Optional Global Loading Indicator */}
      {/* {isLoadingContent && (
          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <p>Loading Content...</p> 
          </div>
      )} */}
    </div>
  );
}

export default App;

