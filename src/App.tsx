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
import { useMediaState } from './hooks/useMediaState';
import { useMediaElementPlayback } from './hooks/useMediaElementPlayback';
import { useFullscreen } from './hooks/useFullscreen';
import { useKeyboardControls } from './hooks/useKeyboardControls';
import { useImageCarousel } from './hooks/useImageCarousel';
import { useMediaContent } from './hooks/useMediaContent'; // <<< ADD useMediaContent import

// ADD RelayPool import
import { useRelayPool } from './main'; // Assuming useRelayPool is exported from main.tsx

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

  // --- Add state for loading message index ---
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const [isLoadingContent, setIsLoadingContent] = useState(true); // Start as true

  // --- Call Hooks --- 
  const auth = useAuth(); 
  const { followedTags, currentUserNpub, isLoggedIn } = auth; // Added isLoggedIn
  
  // Get RelayPool and EventStore from Applesauce/context
  const pool = useRelayPool(); // ADDED: Get pool instance
  const eventStore = Hooks.useEventStore(); // ADDED: Get eventStore instance (ensure Hooks.useEventStore exists and is correctly provided)

  // --- Fetch Follow List (Kind 3) --- (Keep this)
  const pubkeyToFetchFollowsFor = useMemo(() => {
      if (isLoggedIn && currentUserNpub) {
          try {
              return nip19.decode(currentUserNpub).data as string;
          } catch (e) {
              console.error("Error decoding currentUserNpub:", e);
              return nip19.decode(TV_PUBKEY_NPUB).data as string;
          }
      }
      return nip19.decode(TV_PUBKEY_NPUB).data as string; // Default TV pubkey
  }, [isLoggedIn, currentUserNpub]);

  const contactsData = Hooks.useStoreQuery(Queries.ContactsQuery, pubkeyToFetchFollowsFor ? [pubkeyToFetchFollowsFor] : null);
  
  useEffect(() => {
    console.log("[App.tsx] contactsData updated (raw from useStoreQuery):", contactsData);
    const newIsLoading = contactsData === undefined;
    if (newIsLoading !== isLoadingContent) {
        console.log(`[App.tsx] isLoadingContent changing from ${isLoadingContent} to ${newIsLoading}`);
        setIsLoadingContent(newIsLoading);
    }
  }, [contactsData, isLoadingContent]); // Added isLoadingContent to dependency array for correct comparison

  // Stabilize followedPubkeys to prevent unnecessary re-renders down the chain
  const followedPubkeysString = useMemo(() => {
    if (!Array.isArray(contactsData)) return '[]';
    // Sort to ensure order doesn't cause changes if the set is the same
    // and filter out any undefined/null pubkeys before sorting & stringifying.
    const pubkeys = contactsData
        .map((pointer: any) => pointer?.pubkey)
        .filter((pubkey): pubkey is string => typeof pubkey === 'string'); // Ensure only strings
    pubkeys.sort();
    return JSON.stringify(pubkeys);
  }, [contactsData]);

  const followedPubkeys = useMemo(() => {
      console.log("[App.tsx] Recomputing followedPubkeys from string. contactsData ref may have changed, but stringified content is:", followedPubkeysString);
      return JSON.parse(followedPubkeysString);
  }, [followedPubkeysString]);

  // --- Effect to subscribe to logged-in user's Kind 3 (Contact List) ---
  useEffect(() => {
    // According to nostr-tools, pool.subscribeMany returns SubCloser[], which is is an array of subscriptions.
    // Each element in the array should have an `unsub` method.
    let userContactsSubscriptions: Array<{ unsub: () => void }> | null = null;

    if (isLoggedIn && currentUserNpub && pool && eventStore) {
      try {
        const loggedInUserHexPubkey = nip19.decode(currentUserNpub).data as string;
        console.log(`[App.tsx] Logged in user detected: ${currentUserNpub} (hex: ${loggedInUserHexPubkey}). Subscribing to their Kind 3 event.`);

        const userContactsFilter: Filter[] = [{ kinds: [3], authors: [loggedInUserHexPubkey], limit: 1 }];
        
        const subClosers = pool.subscribeMany(RELAYS, userContactsFilter, {
          onevent(event: NostrEvent) {
            console.log(`[App.tsx] Received Kind 3 event for logged-in user ${loggedInUserHexPubkey}:`, event);
            eventStore.add(event);
          },
          oneose() {
            console.log(`[App.tsx] EOSE received for logged-in user ${loggedInUserHexPubkey} Kind 3 subscription.`);
          },
          onclose(reason) {
            console.warn(`[App.tsx] Subscription for logged-in user ${loggedInUserHexPubkey} Kind 3 closed:`, reason);
          }
        });

        // Ensure subClosers is an array and its elements have an unsub method.
        if (Array.isArray(subClosers) && subClosers.every(sc => typeof sc.unsub === 'function')) {
          userContactsSubscriptions = subClosers as Array<{ unsub: () => void }>;
        } else {
          console.warn("[App.tsx] pool.subscribeMany did not return the expected SubCloser[] array. Actual return:", subClosers);
          // Attempt to handle if it's a single object with unsub (less likely based on SubCloser type)
          if (subClosers && typeof (subClosers as any).unsub === 'function') {
             userContactsSubscriptions = [subClosers as any]; 
          }
        }

      } catch (error) {
        console.error("[App.tsx] Error setting up Kind 3 subscription for logged-in user:", error);
      }
    }

    // Cleanup function to unsubscribe when component unmounts or dependencies change
    return () => {
      if (userContactsSubscriptions && userContactsSubscriptions.length > 0) {
        console.log("[App.tsx] Cleaning up Kind 3 subscriptions for user:", currentUserNpub);
        userContactsSubscriptions.forEach(sub => {
          try {
            sub.unsub();
          } catch (e) {
            console.warn("[App.tsx] Error during unsub:", e, sub);
          }
        });
      }
    };
  }, [isLoggedIn, currentUserNpub, pool, eventStore, RELAYS]);

  // --- Fetch Media Content using the Refactored Hook --- 
  const { 
      shuffledImageNotes, 
      shuffledVideoNotes, 
      podcastNotes,         
      fetchOlderImages, 
      fetchOlderVideos, 
      isLoadingImages,      
      isLoadingVideos, 
      isLoadingPodcasts 
  } = useMediaContent({ followedAuthorPubkeys: followedPubkeys, followedTags });

  // --- REMOVE state for Fetching Control & Raw/Shuffled Notes --- 
  // const [imageFetchLimit, setImageFetchLimit] = useState(INITIAL_IMAGE_FETCH_LIMIT);
  // const [videoFetchLimit, setVideoFetchLimit] = useState(INITIAL_VIDEO_FETCH_LIMIT);
  // const [imageFetchUntil, setImageFetchUntil] = useState<number | undefined>(undefined);
  // const [videoFetchUntil, setVideoFetchUntil] = useState<number | undefined>(undefined);
  // const [rawImageNotes, setRawImageNotes] = useState<NostrEvent[]>([]);
  // const [rawVideoNotes, setRawVideoNotes] = useState<NostrEvent[]>([]);
  // const [rawPodcastNotes, setRawPodcastNotes] = useState<NostrEvent[]>([]); 
  // const [shuffledImageNotes, setShuffledImageNotes] = useState<NostrEvent[]>([]);
  // const [shuffledVideoNotes, setShuffledVideoNotes] = useState<NostrEvent[]>([]);

  // --- State for Podcast Initial Time (if needed) --- 
  const [initialPodcastTime] = useState<number>(0);

  // --- Media Refs --- 
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const imageFeedRef = useRef<HTMLDivElement>(null);

  // --- UI State & Playback Hooks --- 
  const { 
      viewMode,
      imageNotes, // from useMediaState, if needed directly by App
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
    initialImageNotes: shuffledImageNotes,
    initialPodcastNotes: podcastNotes, // Pass processed podcasts from useMediaContent
    initialVideoNotes: shuffledVideoNotes,
    fetchOlderImages,
    fetchOlderVideos,
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
    return null; 
  }, [viewMode, currentImageIndex, currentVideoIndex, shuffledImageNotes, shuffledVideoNotes]);

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
      // TODO: Find correct way to access relay manager/status from eventStore or pool?
      const connectedRelaysCount = 0; // Placeholder
      const knownRelaysCount = RELAYS.length; // Placeholder
      return {
          isReceivingData: connectedRelaysCount > 0, 
          relayCount: knownRelaysCount, 
      };
  }, []);

  // REMOVE media filter construction logic
  // const mediaFilters = useMemo(() => { ... }, ...);

  // REMOVE direct media fetching calls
  // const fetchedImageNotes: NostrEvent[] | undefined = Hooks.useStoreQuery(...);
  // const fetchedVideoNotes: NostrEvent[] | undefined = Hooks.useStoreQuery(...);
  // const fetchedPodcastNotes: NostrEvent[] | undefined = Hooks.useStoreQuery(...);

  // REMOVE useEffects for processing/shuffling raw notes
  // useEffect(() => { if (fetchedImageNotes) { ... setRawImageNotes ... } }, [fetchedImageNotes]);
  // useEffect(() => { if (fetchedVideoNotes) { ... setRawVideoNotes ... } }, [fetchedVideoNotes]);
  // useEffect(() => { if (fetchedPodcastNotes) { ... setRawPodcastNotes ... } }, [fetchedPodcastNotes]);
  // useEffect(() => { ... setShuffledImageNotes ... }, [rawImageNotes]);
  // useEffect(() => { ... setShuffledVideoNotes ... }, [rawVideoNotes]);

  // --- Update Overall Loading State --- 
  // Base loading on contacts query resolving, as media loading is handled by useMediaContent
  // const isFollowsLoading = contactsData === undefined; // Replaced by isLoadingContent state
  // const isLoadingContent = isFollowsLoading; // Replaced by isLoadingContent state
  // DEBUG: Keep log for now
  console.log('[App.tsx DEBUG] Final isLoadingContent (from state):', isLoadingContent);

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
    console.log("[App.tsx] Rendering LOADING SPINNER (Waiting for Follows)"); 
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
          {viewMode === 'imagePodcast' ? (
            <motion.div
              key="imageFeed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
              className="w-full h-full"
            >
              <ImageFeed 
                imageNotes={shuffledImageNotes} 
                currentImageIndex={currentImageIndex} 
              />
            </motion.div>
          ) : (
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

