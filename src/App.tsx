import { useEffect, useCallback, useRef, useState, useMemo } from 'react';
import { nip19, Filter, NostrEvent } from 'nostr-tools'; // Core Nostr types
import { motion, AnimatePresence } from 'framer-motion';

// Applesauce imports
import {
    QueryStoreProvider, // React Context Provider
    Hooks             // React Hooks namespace
} from 'applesauce-react';
import {
    Queries,          // Core Query definitions
    EventStore,       // Correct: from -core
    QueryStore        // Correct: from -core
} from 'applesauce-core';
// Helpers/Types - Assuming these paths and existence based on previous info
// import { ProfileContent } from 'applesauce-core/helpers/profile'; // Type not explicitly needed if relying on inference
// import { getContactsPubkeys } from 'applesauce-core/helpers/contacts'; // Helper function - keep manual parsing for now

// import { SimpleSigner } from 'applesauce-signers'; // Not directly used in App.tsx

// Local Hooks
import { useAuth } from './hooks/useAuth';
import { useMediaState } from './hooks/useMediaState';
import { useMediaElementPlayback } from './hooks/useMediaElementPlayback';
import { useFullscreen } from './hooks/useFullscreen';
import { useKeyboardControls } from './hooks/useKeyboardControls';
import { useImageCarousel } from './hooks/useImageCarousel';
// import { useWallet } from './hooks/useWallet'; // Wallet hook not used directly in App.tsx

// Local Components
import ImageFeed from './components/ImageFeed';
import MessageBoard from './components/MessageBoard';
import MediaPanel from './components/MediaPanel';
import RelayStatus from './components/RelayStatus';
import VideoPlayer from './components/VideoPlayer';
import SettingsModal from './components/SettingsModal';

// Local Constants
import { MAIN_THREAD_NEVENT_URI, RELAYS, TV_PUBKEY_NPUB } from './constants';

// Local Utils
import { shuffleArray } from './utils/shuffleArray';

// Fullscreen Timeouts
const INTERACTION_TIMEOUT = 30000; // 30 seconds
const MESSAGE_TIMEOUT = 120000; // 2 minutes
const CHECK_INTERVAL = 5000; // Check every 5 seconds

// --- Constants ---
const IMAGE_CAROUSEL_INTERVAL = 45000; // 45 seconds
const INITIAL_IMAGE_FETCH_LIMIT = 20;
const INITIAL_VIDEO_FETCH_LIMIT = 20;
const LOAD_MORE_COUNT = 10; // How many more to fetch when scrolling

function App() {
  // --- Call ALL Hooks Unconditionally at the Top --- 
  // const initNDK = useNDKInit(); // <-- REMOVE
  // const { ndk } = useNDK(); // <-- REMOVE
  // console.log("[App.tsx] Value of ndk from useNDK():", ndk); // <-- REMOVE
  const auth = useAuth(); 
  const { followedTags, currentUserNpub, isLoggedIn } = auth; // Added isLoggedIn
  const queryStore = Hooks.useQueryStore(); // Get queryStore instance
  const eventStore = Hooks.useEventStore(); // Get eventStore instance for relay info

  // --- Initialize NDK Directly --- 
  // Remove the useEffect later in the file that did this.
  // initNDK(ndkInstance); // <-- REMOVE
  // console.log("App.tsx: Called initNDK(ndkInstance) directly."); // <-- REMOVE

  // --- Media Content Hook --- 
  // const { 
  //     shuffledImageNotes,
  //     shuffledVideoNotes,
  //     podcastNotes,
  //     fetchOlderImages,
  //     fetchOlderVideos,
  //     // Add loading states if needed for UI
  //     isLoadingKind3, 
  //     isLoadingImages,
  //     isLoadingVideos,
  //     isLoadingPodcasts 
  // } = useMediaContent({ followedTags, currentUserNpub }); // <-- REMOVE

  // --- State for Fetching Control ---
  const [imageFetchLimit, setImageFetchLimit] = useState(INITIAL_IMAGE_FETCH_LIMIT);
  const [videoFetchLimit, setVideoFetchLimit] = useState(INITIAL_VIDEO_FETCH_LIMIT);
  const [imageFetchUntil, setImageFetchUntil] = useState<number | undefined>(undefined);
  const [videoFetchUntil, setVideoFetchUntil] = useState<number | undefined>(undefined);

  // --- State for Fetched Notes (Raw from useQuery) ---
  const [rawImageNotes, setRawImageNotes] = useState<NostrEvent[]>([]);
  const [rawVideoNotes, setRawVideoNotes] = useState<NostrEvent[]>([]);
  const [rawPodcastNotes, setRawPodcastNotes] = useState<NostrEvent[]>([]); // Renamed for clarity

  // --- State for Shuffled Notes (Derived from Raw) ---
  const [shuffledImageNotes, setShuffledImageNotes] = useState<NostrEvent[]>([]);
  const [shuffledVideoNotes, setShuffledVideoNotes] = useState<NostrEvent[]>([]);

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
      initialImageNotes: shuffledImageNotes, // Use shuffled state
      initialPodcastNotes: rawPodcastNotes, // Use raw podcast state (no shuffle needed)
      initialVideoNotes: shuffledVideoNotes, // Use shuffled state
      fetchOlderImages: useCallback(() => { // Define fetchOlder callback inline for now
          if (rawImageNotes.length > 0) {
              const oldestTimestamp = rawImageNotes.reduce((oldest, note) => Math.min(oldest, note.created_at), Infinity);
              // Set 'until' to slightly before the oldest note to avoid duplicates
              setImageFetchUntil(oldestTimestamp -1); 
              setImageFetchLimit(prev => prev + LOAD_MORE_COUNT); // Optionally increase limit too
              console.log('fetchOlderImages triggered');
          }
      }, [rawImageNotes]), // Dependency on raw notes
      fetchOlderVideos: useCallback(() => { // Define fetchOlder callback inline for now
          if (rawVideoNotes.length > 0) {
              const oldestTimestamp = rawVideoNotes.reduce((oldest, note) => Math.min(oldest, note.created_at), Infinity);
              // Set 'until' to slightly before the oldest note to avoid duplicates
              setVideoFetchUntil(oldestTimestamp -1); 
              setVideoFetchLimit(prev => prev + LOAD_MORE_COUNT); // Optionally increase limit too
              console.log('fetchOlderVideos triggered');
          }
      }, [rawVideoNotes]), // Dependency on raw notes
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
  // Calculate Relay Status Props
  const relayStatusProps = useMemo(() => {
      // TODO: Find correct way to access relay manager/status from eventStore
      const connectedRelaysCount = 0; // Placeholder
      const knownRelaysCount = RELAYS.length; // Placeholder
      /* // Original logic - caused type error
      const connectedRelaysCount = eventStore?.relayManager?.connectedRelays?.length ?? 0;
      const knownRelaysCount = eventStore?.relayManager?.relays?.size ?? RELAYS.length;
      */
      return {
          isReceivingData: connectedRelaysCount > 0, 
          relayCount: knownRelaysCount, 
      };
  // }, [eventStore]); // Keep dependency commented out until fixed
  }, []); // Temporarily remove dependency

  // --- Placeholder for loading state ---
  // const [isLoadingContent, setIsLoadingContent] = useState(true); // Placeholder

  // --- Fetch Follow List (Kind 3) ---
  const pubkeyToFetchFollowsFor = useMemo(() => {
      if (isLoggedIn && currentUserNpub) {
          try {
              return nip19.decode(currentUserNpub).data as string;
          } catch (e) {
              console.error("Error decoding currentUserNpub:", e);
              // Fallback to default TV pubkey if user npub is invalid
              return nip19.decode(TV_PUBKEY_NPUB).data as string;
          }
      }
      return nip19.decode(TV_PUBKEY_NPUB).data as string; // Default TV pubkey
  }, [isLoggedIn, currentUserNpub]);

  // Get contacts data (Type inferred - likely array of objects with pubkey)
  const contactsData = Hooks.useStoreQuery(Queries.ContactsQuery, pubkeyToFetchFollowsFor ? [pubkeyToFetchFollowsFor] : null);
  // Extract pubkeys from the inferred data structure
  const followedPubkeys = useMemo(() => {
    // Check if it's an array before mapping
    if (!Array.isArray(contactsData)) return [];
    // Assuming objects in the array have a 'pubkey' property
    return contactsData
        .map(pointer => pointer?.pubkey) // Safely access pubkey
        .filter(Boolean); // Simple filter for truthy values
   }, [contactsData]);

  // --- Construct Filters for Media ---
  const mediaFilters = useMemo(() => {
    const authorsFilter = followedPubkeys.length > 0 ? { authors: followedPubkeys } : {};
    const tagsFilter = followedTags.length > 0 ? { '#t': followedTags } : {};

    // How to combine authors OR tags? Applesauce might handle multiple filters implicitly as OR.
    // Let's try creating separate filters for authors and tags and see if useQuery merges them.
    // If not, we might need multiple useQuery calls or a more complex single filter if supported.

    const baseImageFilters = { 
        kinds: [1063], 
        limit: imageFetchLimit, 
        ...(imageFetchUntil && { until: imageFetchUntil }) 
    };
    const baseVideoFilters = { 
        kinds: [34235], 
        limit: videoFetchLimit, 
        ...(videoFetchUntil && { until: videoFetchUntil }) 
    };
    const basePodcastFilters = { 
        kinds: [31337] 
        // Add limit/until if needed for podcasts later
    };

    // Strategy 1: Combine authors and tags into single filters (if supported)
    const imageFilter = { ...baseImageFilters, ...authorsFilter, ...tagsFilter };
    const videoFilter = { ...baseVideoFilters, ...authorsFilter, ...tagsFilter };
    const podcastFilter = { ...basePodcastFilters, ...authorsFilter }; // Only author follows for podcasts for now

    console.log("[App.tsx] Constructed Filters:", { imageFilter, videoFilter, podcastFilter });

    return { imageFilter, videoFilter, podcastFilter };

  }, [followedPubkeys, followedTags, imageFetchLimit, videoFetchLimit, imageFetchUntil, videoFetchUntil]);


  // --- Fetch Media Notes using useStoreQuery with TimelineQuery ---
  const fetchedImageNotes: NostrEvent[] | undefined = Hooks.useStoreQuery(Queries.TimelineQuery, [mediaFilters.imageFilter]);
  const fetchedVideoNotes: NostrEvent[] | undefined = Hooks.useStoreQuery(Queries.TimelineQuery, [mediaFilters.videoFilter]);
  const fetchedPodcastNotes: NostrEvent[] | undefined = Hooks.useStoreQuery(Queries.TimelineQuery, [mediaFilters.podcastFilter]);

  // --- Update Raw Notes State when Fetched Data Changes ---
  useEffect(() => {
      if (fetchedImageNotes) {
          console.log(`[App.tsx] Received ${fetchedImageNotes.length} image events for filter:`, mediaFilters.imageFilter);
          setRawImageNotes(prevNotes => {
              const existingIds = new Set(prevNotes.map(note => note.id));
              const newNotes = fetchedImageNotes.filter(note => !existingIds.has(note.id));
              if (newNotes.length > 0) {
                  console.log(`[App.tsx] Adding ${newNotes.length} new image events.`);
                  return [...prevNotes, ...newNotes].sort((a, b) => b.created_at - a.created_at);
              }
              return prevNotes;
          });
      }
  }, [fetchedImageNotes]);

  useEffect(() => {
      if (fetchedVideoNotes) {
          console.log(`[App.tsx] Received ${fetchedVideoNotes.length} video events for filter:`, mediaFilters.videoFilter);
          setRawVideoNotes(prevNotes => {
              const existingIds = new Set(prevNotes.map(note => note.id));
              const newNotes = fetchedVideoNotes.filter(note => !existingIds.has(note.id));
              if (newNotes.length > 0) {
                  console.log(`[App.tsx] Adding ${newNotes.length} new video events.`);
                  return [...prevNotes, ...newNotes].sort((a, b) => b.created_at - a.created_at);
              }
              return prevNotes;
          });
      }
  }, [fetchedVideoNotes]);

  useEffect(() => {
      if (fetchedPodcastNotes) {
          console.log(`[App.tsx] Received ${fetchedPodcastNotes.length} podcast events for filter:`, mediaFilters.podcastFilter);
          setRawPodcastNotes([...fetchedPodcastNotes].sort((a, b) => b.created_at - a.created_at));
      }
  }, [fetchedPodcastNotes]);


  // --- Shuffle Image and Video Notes ---
  useEffect(() => {
      console.log("[App.tsx] Shuffling images...");
      if (rawImageNotes) {
        setShuffledImageNotes(shuffleArray([...rawImageNotes]));
      }
  }, [rawImageNotes]);

  useEffect(() => {
      console.log("[App.tsx] Shuffling videos...");
       if (rawVideoNotes) {
        setShuffledVideoNotes(shuffleArray([...rawVideoNotes]));
      }
  }, [rawVideoNotes]);

  // --- Update Overall Loading State (Implicit) --- Check if initial data is loaded
  const isFollowsLoading = contactsData === undefined;
  // Check if *any* of the media types have loaded initial data
  // Note: This is a simplified check. Might need refinement based on UX.
  const isMediaLoading = fetchedImageNotes === undefined && fetchedVideoNotes === undefined && fetchedPodcastNotes === undefined;
  const isLoadingContent = isFollowsLoading || isMediaLoading; // Loading if follows OR media are undefined

  // --- Main Render (NDK is ready) --- 
  // console.log("App.tsx: NDK instance is ready, rendering main app."); // <-- REMOVE NDK log

  // --- Placeholder for loading state ---
  if (isLoadingContent) {
    return (
      <div className="relative flex flex-col min-h-screen h-screen text-white border-2 border-purple-900 bg-gradient-radial from-gray-900 via-black to-black items-center justify-center">
        <div className="mb-4 w-16 h-16 animate-spin border-4 border-purple-600 border-t-transparent rounded-full"></div>
           <p className="animate-pulse">Loading Media...</p>
      </div>
    );
  }

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
              podcastNotes={rawPodcastNotes}
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

