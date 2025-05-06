import { useEffect, useCallback, useRef, useState, useMemo } from 'react';
import { nip19, Filter, NostrEvent } from 'nostr-tools'; // Core Nostr types
import { motion, AnimatePresence } from 'framer-motion';

// Applesauce imports
import {
    // QueryStoreProvider, // No longer needed here, provided in main.tsx
    Hooks             // React Hooks namespace
} from 'applesauce-react';
import {
    Queries,          // Core Query definitions
    // EventStore,       // Keep if needed for relay status?
    // QueryStore        // Not directly used here
} from 'applesauce-core';

// Local Hooks
import { useAuth } from './hooks/useAuth';
import { useMediaState, UseMediaStateProps } from './hooks/useMediaState';
import { useMediaElementPlayback } from './hooks/useMediaElementPlayback';
import { useFullscreen } from './hooks/useFullscreen';
import { useKeyboardControls } from './hooks/useKeyboardControls';
import { useImageCarousel } from './hooks/useImageCarousel';
import { useMediaContent, UseMediaContentProps } from './hooks/useMediaContent';

// ADD RelayPool import
import { useRelayPool } from './contexts/RelayPoolContext'; // ADD this import

// Local Components
import ImageFeed from './components/ImageFeed';
import MessageBoard from './components/MessageBoard';
import MediaPanel from './components/MediaPanel';
import RelayStatus from './components/RelayStatus';
import VideoPlayer from './components/VideoPlayer';
import SettingsModal from './components/SettingsModal';

// Local Constants
import { MAIN_THREAD_NEVENT_URI, RELAYS, TV_PUBKEY_NPUB } from './constants';

// REMOVE unused utils
// import { shuffleArray } from './utils/shuffleArray';

// --- Add back loading messages array ---
const loadingMessages = [
  "Tuning into the cosmic streams...",
  "Aligning the digital constellations...",
  "Reticulating splines...",
  "Charging the flux capacitor...",
  "Brewing cyber-coffee...",
  "Asking the magic smoke nicely...",
  "Untangling the timelines...",
  "Polishing the pixels...",
];

// Fullscreen Timeouts
const INTERACTION_TIMEOUT = 30000; // 30 seconds
const MESSAGE_TIMEOUT = 120000; // 2 minutes
const CHECK_INTERVAL = 5000; // Check every 5 seconds

// --- Constants ---
const IMAGE_CAROUSEL_INTERVAL = 45000; // 45 seconds
// REMOVE Fetch limits - managed by useMediaContent
// const INITIAL_IMAGE_FETCH_LIMIT = 20;
// const INITIAL_VIDEO_FETCH_LIMIT = 20;
// const LOAD_MORE_COUNT = 10; // How many more to fetch when scrolling

function App() {
  console.log("[App.tsx] Function body execution START");
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const [isLoadingContent, setIsLoadingContent] = useState(true); 
  const auth = useAuth(); 
  const { followedTags, currentUserNpub, isLoggedIn, fetchImagesByTagEnabled, fetchVideosByTagEnabled } = auth;
  const pool = useRelayPool(); 
  const eventStore = Hooks.useEventStore(); 

  const pubkeyToFetchFollowsFor = useMemo(() => {
      if (isLoggedIn && currentUserNpub) {
          try {
              return nip19.decode(currentUserNpub).data as string;
          } catch (e) {
              console.error("Error decoding currentUserNpub:", e);
              // Fallback to default TV_PUBKEY_NPUB's hex
              try {
                return nip19.decode(TV_PUBKEY_NPUB).data as string;
              } catch (e2) {
                console.error("Error decoding TV_PUBKEY_NPUB:", e2);
                return null; // Or some other safe default
              }
          }
      }
      // Default TV_PUBKEY_NPUB's hex
      try {
        return nip19.decode(TV_PUBKEY_NPUB).data as string; 
      } catch (e) {
        console.error("Error decoding TV_PUBKEY_NPUB for default:", e);
        return null; // Or some other safe default
      }
  }, [isLoggedIn, currentUserNpub]);
  // --- Log pubkey directly ---
  console.log('[App.tsx BODY] pubkeyToFetchFollowsFor:', pubkeyToFetchFollowsFor);

  const contactsData = Hooks.useStoreQuery(Queries.ContactsQuery, pubkeyToFetchFollowsFor ? [pubkeyToFetchFollowsFor] : null);
  // --- Log contactsData directly ---
  console.log("[App.tsx BODY] contactsData:", contactsData ? JSON.parse(JSON.stringify(contactsData)) : contactsData); 
  // --- Detailed contactsData inspection ---
  if (Array.isArray(contactsData) && contactsData.length > 0) {
      console.log("[App.tsx BODY] First item in contactsData:", JSON.parse(JSON.stringify(contactsData[0])));
      const attemptedPubkeys = contactsData.map((p: any) => p?.pubkey);
      console.log("[App.tsx BODY] Attempted pubkeys from contactsData:", attemptedPubkeys);
  } else if (contactsData !== undefined) {
      console.log("[App.tsx BODY] contactsData is defined but not a non-empty array.");
  }

  // --- Manage isLoadingContent State ---
  useEffect(() => {
    // Only transition from true to false once when contactsData becomes available
    if (isLoadingContent && contactsData !== undefined) {
        console.log(`[App.tsx DIAGNOSTIC EFFECT] contactsData is now defined. Setting isLoadingContent to false.`);
        setIsLoadingContent(false);
    }
    // If we need to handle user logout making contactsData undefined again, 
    // this logic would need to be more complex, but for loop diagnosis, this is simpler.
  }, [contactsData, isLoadingContent]); // Keep dependencies to re-evaluate if they change

  const followedPubkeysString = useMemo(() => {
    if (!Array.isArray(contactsData)) {
      console.log('[App.tsx] contactsData is not an array or undefined, defaulting followedPubkeysString to []. contactsData:', contactsData);
      return '[]';
    }
    const pubkeys = contactsData
        .map((pointer: any) => pointer?.pubkey) // Assuming pointer.pubkey is correct
        .filter((pubkey): pubkey is string => {
          if (typeof pubkey !== 'string') {
            // console.warn('[App.tsx] Filtered out non-string pubkey from contactsData item:', pointer);
            return false;
          }
          return true;
        }); 
    pubkeys.sort();
    // console.log('[App.tsx] Extracted and sorted pubkeys for followedPubkeysString:', pubkeys);
    return JSON.stringify(pubkeys);
  }, [contactsData]);

  const followedPubkeys = useMemo(() => {
      // console.log("[App.tsx] Recomputing followedPubkeys..."); // Log moved
      return JSON.parse(followedPubkeysString);
  }, [followedPubkeysString]);
  // --- Log followedPubkeys directly ---
  console.log("[App.tsx BODY] followedPubkeys:", followedPubkeys ? JSON.parse(JSON.stringify(followedPubkeys)) : followedPubkeys);

  // --- Log Inputs to useMediaContent directly ---
  console.log('[App.tsx BODY] Inputs to useMediaContent:', { 
      followedAuthorPubkeys: JSON.parse(JSON.stringify(followedPubkeys)), 
      followedTags: JSON.parse(JSON.stringify(followedTags)) 
  });

  const { 
      shuffledImageNotes, 
      shuffledVideoNotes, 
      podcastNotes,         
      fetchOlderImages, 
      fetchOlderVideos, 
      isLoadingImages,      
      isLoadingVideos, 
      isLoadingPodcasts 
  } = useMediaContent({
    followedAuthorPubkeys: followedPubkeys || [],
    followedTags: followedTags || [],
    fetchImagesByTagEnabled: fetchImagesByTagEnabled,
    fetchVideosByTagEnabled: fetchVideosByTagEnabled,
  });

  // --- State for Podcast Initial Time (if needed) --- 
  const [initialPodcastTime] = useState<number>(0);

  // --- Media Refs --- 
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const imageFeedRef = useRef<HTMLDivElement>(null);

  // --- UI State & Playback Hooks --- 
  const { 
      viewMode,
      imageNotesForDisplay, // Corrected from imageNotes
      // podcastNotes, // from useMediaState, if needed directly by App (already have from useMediaContent)
      // videoNotes, // from useMediaState, if needed directly by App (already have from useMediaContent)
      currentImageIndex,
      currentPodcastIndex,
      currentVideoIndex,
      selectedVideoNpub,
      currentItemUrl,
      currentVideoNote, // <<< ADDED: Get currentVideoNote from useMediaState
      handleVideoSelect,
      handlePrevious,
      handleNext,
      setViewMode,
      setCurrentPodcastIndex,
  } = useMediaState({
    fullImageCache: shuffledImageNotes,
    fullPodcastCache: podcastNotes,
    fullVideoCache: shuffledVideoNotes,
    fetchOlderImages,
    fetchOlderVideos,
  });

  // --- Derive currentNoteId --- 
  const currentNoteId = useMemo(() => {
    if (viewMode === 'imagePodcast' && imageNotesForDisplay[currentImageIndex]) { // Corrected from shuffledImageNotes to imageNotesForDisplay
        return imageNotesForDisplay[currentImageIndex].id;
    } else if (viewMode === 'videoPlayer' && shuffledVideoNotes[currentVideoIndex]) {
        return shuffledVideoNotes[currentVideoIndex].id;
    }
    return null; 
  }, [viewMode, currentImageIndex, currentVideoIndex, imageNotesForDisplay, shuffledVideoNotes]); // Corrected dependency

  const activeMediaRef = viewMode === 'videoPlayer' ? videoRef : audioRef;

  const { 
      isPlaying, currentTime, duration, playbackRate, setPlaybackRate, 
      togglePlayPause, handleSeek, play, pause, isSeeking, setIsSeeking, 
      isMuted, autoplayFailed, toggleMute 
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
  // Calculate Relay Status Props
  const relayStatusProps = useMemo(() => {
      const knownCount = RELAYS.length; // Use the length of the configured RELAYS array
      // For now, assume data is being received if the pool object exists.
      // A more robust check would involve tracking actual event flow or relay connection events.
      const isDataReceiving = !!pool; 
      
      console.log('[App.tsx] RelayStatusProps Calculated (Simplified):', { knownCount, isDataReceiving });

      return {
          isReceivingData: isDataReceiving, 
          relayCount: knownCount, 
      };
  }, [pool, RELAYS]); // Depend on pool (to react if it becomes available) and RELAYS (if it could ever change)
  // --- Log relayStatusProps directly ---
  console.log("[App.tsx BODY] relayStatusProps:", relayStatusProps ? JSON.parse(JSON.stringify(relayStatusProps)) : relayStatusProps);

  // --- Effect to cycle loading message --- 
  useEffect(() => {
    // Only run the interval logic if the main content IS loading
    let intervalId: NodeJS.Timeout | null = null;
    if (isLoadingContent) {
      intervalId = setInterval(() => {
        setLoadingMessageIndex(prevIndex => (prevIndex + 1) % loadingMessages.length);
      }, 2500); 
    }
    // Cleanup function to clear the interval if content loads or component unmounts
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isLoadingContent]); // Re-run effect if loading state changes

  // --- Loading State --- 
  if (isLoadingContent) {
    console.log("[App.tsx] Rendering LOADING SPINNER (Waiting for Follows/Contacts)"); 
    return (
      <div className="relative flex flex-col min-h-screen h-screen text-white border-2 border-purple-900 bg-gradient-radial from-gray-900 via-black to-black items-center justify-center">
          <div className="mb-4 w-16 h-16 animate-spin border-4 border-purple-600 border-t-transparent rounded-full"></div>
            {/* Use cycling message */}
            <p className="animate-pulse">{loadingMessages[loadingMessageIndex]}</p> 
        </div>
    );
  }

  console.log("[App.tsx] Rendering MAIN CONTENT");

  // --- Main Render --- 
  return (
    <div className={`flex flex-col h-screen overflow-hidden bg-black text-white relative ${isFullScreen ? '' : 'p-4 border-8 border-gray-800'}`}>
      {/* Invisible Audio Player */}
      <audio ref={audioRef} src={viewMode === 'imagePodcast' ? (currentItemUrl ?? undefined) : undefined} preload="auto" />

      {/* Main Content Area */}
      <div className="flex-grow flex flex-col overflow-hidden">
        <AnimatePresence mode="wait">
          {viewMode === 'imagePodcast' && (
            <motion.div 
              key="image-feed"
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full h-full"
            >
              <ImageFeed 
                imageNotes={imageNotesForDisplay} // Corrected from shuffledImageNotes
                currentImageIndex={currentImageIndex}
              />
            </motion.div>
          )}
          {viewMode === 'videoPlayer' && currentItemUrl && (
            <motion.div
              key="videoPlayer"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
              className="w-full h-full"
            >
              <VideoPlayer 
                videoRef={videoRef}
                src={currentItemUrl} // currentItemUrl should be set by useMediaState for videos
                authorPubkey={currentVideoNote?.pubkey || null} // <<< ADDED: Pass authorPubkey
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

      {/* Optional Global Loading Indicator (Could use media loading states here) */}
      {/* {(isLoadingImages || isLoadingVideos || isLoadingPodcasts) && !isLoadingContent && (...)} */}
    </div>
  );
}

export default App;

