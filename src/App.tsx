import { useEffect, useCallback, useRef, useState, useMemo } from 'react';
import QRCode from 'react-qr-code';
import { nip19 } from 'nostr-tools';
import ndkInstance from './ndk'; // <-- Import the singleton NDK instance
import { useNDKInit } from './hooks/useNDKInit'; // <-- Import useNDKInit
import ImageFeed, { ImageFeedRef } from './components/ImageFeed';
import MediaPanel from './components/MediaPanel';
import RelayStatus, { RelayStatusHandle } from './components/RelayStatus'; // <<< Import Handle
import VideoPlayer from './components/VideoPlayer';
import { MAIN_THREAD_NEVENT_URI, RELAYS } from './constants';
import { useMediaAuthors } from './hooks/useMediaAuthors';
import { useMediaState } from './hooks/useMediaState';
import { useMediaElementPlayback } from './hooks/useMediaElementPlayback';
import { useMediaNotes } from './hooks/useMediaNotes';
import { useFullscreen } from './hooks/useFullscreen';
import { useKeyboardControls } from './hooks/useKeyboardControls';
import { useImageCarousel } from './hooks/useImageCarousel';
import { useCurrentAuthor } from './hooks/useCurrentAuthor';
import { useUserProfile } from './hooks/useUserProfile';
import { NostrNote } from './types/nostr';
import { shuffleArray } from './utils/shuffleArray';
import { motion, AnimatePresence } from 'framer-motion';
import SettingsModal from './components/SettingsModal';
import { AuthProvider, useAuthContext } from './context/AuthContext';
import { WalletProvider, useWalletContext } from './context/WalletContext';
import MessageBoard from './components/MessageBoard';
import { useProfile } from 'nostr-hooks';
import NDK, { NDKUser } from '@nostr-dev-kit/ndk';

// Restore original timeout constants
const INTERACTION_TIMEOUT = 30000; // Or original value
const MESSAGE_TIMEOUT = 120000;    // Or original value
const CHECK_INTERVAL = 5000;

// --- Constants ---
const IMAGE_CAROUSEL_INTERVAL = 45000; // 45 seconds
const FULLSCREEN_INACTIVITY_TIMEOUT = 45000; // 45 seconds for fullscreen inactivity
const VIDEO_PLAYLIST_INITIAL_LIMIT = 15;
const VIDEO_PLAYLIST_LOAD_BATCH_SIZE = 15;
const IMAGE_TAG_FETCH_LIMIT = 30; // <<< Add constant for tag image limit
const VIDEO_TAG_FETCH_LIMIT = 15; // <<< New constant for video tag limit

// Component that actually contains the app logic, nested inside providers
function AppContent({ isNdkReady, ndkInstance }: { isNdkReady: boolean, ndkInstance: NDK }) {
  const ndk = ndkInstance;

  const auth = useAuthContext();
  const wallet = useWalletContext();

  // <<< Ref for RelayStatus component >>>
  const relayStatusRef = useRef<RelayStatusHandle>(null);

  // Hooks that depend on NDK instance (will get it via useNDK() internally)
  // Pass necessary auth/wallet props if the hooks need them explicitly
  const { mediaAuthors, isLoadingAuthors } = useMediaAuthors({ ndk, isReady: isNdkReady });
  const { followedTags, fetchImagesByTagEnabled, fetchVideosByTagEnabled } = auth; // Use auth from context

  // --- MEMOIZE authors and tags before passing to useMediaNotes ---
  const memoizedMediaAuthors = useMemo(() => mediaAuthors, [mediaAuthors]);
  const memoizedFollowedTags = useMemo(() => followedTags, [followedTags]);
  // ---------------------------------------------------------------

  // Stable reference for empty authors array for tag-only fetches
  const emptyAuthors = useMemo(() => [], []);
  const emptyTags = useMemo(() => [], []);

  // State for fetch parameters - Set initial image limits to 30
  const [imageFetchLimit] = useState<number>(30);
  const [videoFetchLimit] = useState<number>(15);
  const [imageFetchUntil, setImageFetchUntil] = useState<number | undefined>(undefined);
  const [videoFetchUntil, setVideoFetchUntil] = useState<number | undefined>(undefined);
  const [imageTagsFetchUntil, setImageTagsFetchUntil] = useState<number | undefined>(undefined); // New state for tag pagination
  const [videoTagsFetchUntil, setVideoTagsFetchUntil] = useState<number | undefined>(undefined); // New state for tag pagination

  // --- Fetch PODCAST notes (assuming authors only for podcasts) ---
  const { notes: podcastNotes, isLoading: isLoadingPodcastNotes } = useMediaNotes({
    authors: memoizedMediaAuthors,
    mediaType: 'podcast',
    ndk, // <-- Pass ndk prop
    limit: 25 // Keep separate limit for podcasts
  });

  // <<< Memoize podcast notes before passing to useMediaState >>>
  const memoizedPodcastNotes = useMemo(() => podcastNotes, [podcastNotes]);

  // --- Fetch VIDEO notes from AUTHORS ---
  const { notes: authorVideoNotes, isLoading: isLoadingAuthorVideoNotes } = useMediaNotes({
    authors: memoizedMediaAuthors,
    mediaType: 'video',
    ndk, // <-- Pass ndk prop
    limit: videoFetchLimit,
    until: videoFetchUntil,
  });

  // --- Fetch VIDEO notes from TAGS (Conditional) ---
  const { notes: tagVideoNotes, isLoading: isLoadingTagVideoNotes } = useMediaNotes({
    followedTags: fetchVideosByTagEnabled ? memoizedFollowedTags : emptyTags,
    mediaType: 'video',
    ndk, // <-- Pass ndk prop
    limit: VIDEO_TAG_FETCH_LIMIT,
    until: videoTagsFetchUntil,
    authors: emptyAuthors,
  });

  // --- Fetch IMAGE notes from AUTHORS ---
  const { notes: authorImageNotes, isLoading: isLoadingAuthorImages } = useMediaNotes({
    authors: memoizedMediaAuthors,
    mediaType: 'image',
    ndk, // <-- Pass ndk prop
    limit: imageFetchLimit,
    until: imageFetchUntil,
    // No followedTags here
  });

  // --- Fetch IMAGE notes from TAGS (Conditional) ---
  const { notes: tagImageNotes, isLoading: isLoadingTagImages } = useMediaNotes({
    followedTags: fetchImagesByTagEnabled ? memoizedFollowedTags : emptyTags,
    mediaType: 'image',
    ndk, // <-- Pass ndk prop
    limit: IMAGE_TAG_FETCH_LIMIT,
    until: imageTagsFetchUntil,
    authors: emptyAuthors,
  });

  // --- State for COMBINED and DEDUPLICATED notes ---
  const [combinedVideoNotes, setCombinedVideoNotes] = useState<NostrNote[]>([]);
  const [combinedImageNotes, setCombinedImageNotes] = useState<NostrNote[]>([]);

  // --- Effect to COMBINE and DEDUPLICATE VIDEO notes ---
  useEffect(() => {
    // console.log("App: Combining and deduplicating video notes..."); // Keep commented
    // Start with existing notes to append/merge new ones
    const combinedMap = new Map<string, NostrNote>(
      combinedVideoNotes.map(note => [note.id, note]) // Initialize map with current state
    );

    // Add author notes (will overwrite duplicates based on ID, keeping the one from this fetch if ID matches)
    authorVideoNotes.forEach(note => {
      combinedMap.set(note.id, note); // Use set to add/update
    });

    // Add tag notes (will overwrite duplicates based on ID)
    tagVideoNotes.forEach(note => {
      combinedMap.set(note.id, note); // Use set to add/update
    });

    const newCombinedNotes = Array.from(combinedMap.values())
      .sort((a, b) => b.created_at - a.created_at); // Sort newest first

    // Update state only if the actual content changed (compare IDs)
    const currentIds = combinedVideoNotes.map(n => n.id).join(',');
    const newIds = newCombinedNotes.map(n => n.id).join(',');
    if (currentIds !== newIds) {
      console.log(`App: Combined video notes updated. Total: ${newCombinedNotes.length}`);
      setCombinedVideoNotes(newCombinedNotes);
    } else {
      // console.log("App: Combined video notes are the same, skipping update."); // Keep commented
    }
  }, [authorVideoNotes, tagVideoNotes, combinedVideoNotes]); // Add combinedVideoNotes to deps

  // --- Effect to COMBINE, DEDUPLICATE, and FILTER IMAGE notes ---
  useEffect(() => {
    // console.log("App: Combining and deduplicating image notes..."); // Keep commented
    // Start with existing notes
    const combinedMap = new Map<string, NostrNote>(
      combinedImageNotes.map(note => [note.id, note]) // Initialize map with current state
    );

    // Add author notes
    authorImageNotes.forEach(note => {
      combinedMap.set(note.id, note); // Use set to add/update
    });

    // Add tag notes
    tagImageNotes.forEach(note => {
      combinedMap.set(note.id, note); // Use set to add/update
    });

    // Filter out notes missing a URL *after* combining/deduplicating
    const filteredNotes = Array.from(combinedMap.values())
      .filter(note => { // <<< ADD FILTER STEP
        if (!note.url) {
          console.warn(`App: Filtering out image note ${note.id} due to missing URL.`);
          return false;
        }
        return true;
      })
      .sort((a, b) => b.created_at - a.created_at); // Sort newest first

    // Update state only if content changed
    const currentIds = combinedImageNotes.map(n => n.id).join(',');
    const newIds = filteredNotes.map(n => n.id).join(','); // Use filteredNotes
    if (currentIds !== newIds) {
      console.log(`App: Combined & Filtered image notes updated. Total: ${filteredNotes.length}`);
      setCombinedImageNotes(filteredNotes); // Set the filtered notes
    } else {
      // console.log("App: Combined image notes are the same, skipping update."); // Keep commented
    }
  }, [authorImageNotes, tagImageNotes, combinedImageNotes]); // Add combinedImageNotes to deps

  // --- Memoize the shuffled VALID image notes ---
  const shuffledImageNotes = useMemo(() => {
    console.log(`App.tsx: Memoizing shuffled COMBINED ImageNotes (Count: ${combinedImageNotes.length})...`);
    // Shuffle the already filtered combined notes
    return shuffleArray([...combinedImageNotes]);
  }, [combinedImageNotes]); // Depend on the combined state (which is now pre-filtered)

  // State for shuffled notes for display (use combined notes)
  const [uniqueVideoNotes, setUniqueVideoNotes] = useState<NostrNote[]>([]); // Keep for URL deduplication

  // State for limiting the visible video playlist
  const [visibleVideoCount, setVisibleVideoCount] = useState(VIDEO_PLAYLIST_INITIAL_LIMIT);

  // State for podcast saved position
  const [initialPodcastTime] = useState<number>(0);

  // State for preload URL
  const preloadVideoRef = useRef<HTMLVideoElement>(null); // <<< Ref for hidden preload element
  const [preloadVideoUrl, setPreloadVideoUrl] = useState<string | null>(null);

  // --- NDK Stats for RelayStatus ---
  const [relayStats, setRelayStats] = useState(() => ndk?.pool?.stats() || { connected: 0, disconnected: 0, connecting: 0, total: 0 });
  useEffect(() => {
    if (!isNdkReady || !ndk) { // Combine checks
      console.log("AppContent: NDK not ready or missing, delaying relay stats handling.");
      setRelayStats({ connected: 0, disconnected: 0, connecting: 0, total: 0 }); // Reset stats
      return;
    }

    console.log("AppContent: NDK ready, setting up relay stats handling.");

    const updateStats = () => {
        const currentStats = ndk.pool.stats() || { connected: 0, disconnected: 0, connecting: 0, total: 0 };
        // console.log("AppContent: Updating relay stats:", currentStats); // Optional: uncomment for detailed logging
        setRelayStats(currentStats);
    };

    // Initial update
    updateStats();

    // Set up polling interval
    const interval = setInterval(updateStats, 5000); // Poll less frequently (e.g., 5s)

    // Set up event listeners for immediate updates
    const handleConnect = () => {
        console.log("AppContent: ndk.pool relay:connect event detected.");
        // Update stats slightly delayed to allow pool stats to potentially update
        setTimeout(updateStats, 100); 
    };
    const handleDisconnect = () => {
        console.log("AppContent: ndk.pool relay:disconnect event detected.");
        setTimeout(updateStats, 100); 
    };

    ndk.pool.on("relay:connect", handleConnect);
    ndk.pool.on("relay:disconnect", handleDisconnect);

    // Cleanup function
    return () => {
      console.log("AppContent: Clearing relay stats interval and listeners.");
      clearInterval(interval);
      ndk.pool.off("relay:connect", handleConnect);
      ndk.pool.off("relay:disconnect", handleDisconnect);
    };
  }, [isNdkReady, ndk]);

  // Fetcher functions - Reverted -> Updated for combined logic
  const fetchOlderImages = useCallback(() => {
    // Fetch older from authors
    if (authorImageNotes.length > 0) {
      const oldestTimestamp = authorImageNotes[authorImageNotes.length - 1].created_at;
      setImageFetchUntil(oldestTimestamp);
      console.log("App: Fetching older author images (next 30)...");
    }
    // <<< Fetch older from tags ONLY if enabled >>>
    if (fetchImagesByTagEnabled && tagImageNotes.length > 0) {
      const oldestTagTimestamp = tagImageNotes[tagImageNotes.length - 1].created_at;
      setImageTagsFetchUntil(oldestTagTimestamp);
      console.log("App: Fetching older tag images (next 30)...");
    }
    // <<< Add fetchImagesByTagEnabled to dependencies >>>
  }, [authorImageNotes, tagImageNotes, fetchImagesByTagEnabled]);

  const fetchOlderVideos = useCallback(() => {
    if (uniqueVideoNotes.length > visibleVideoCount) {
      // Case 1: Expand visible window
      const newCount = Math.min(visibleVideoCount + VIDEO_PLAYLIST_LOAD_BATCH_SIZE, uniqueVideoNotes.length);
      console.log(`App: Expanding visible video count from ${visibleVideoCount} to ${newCount}`);
      setVisibleVideoCount(newCount);
    } else {
      // Case 2: Fetch older from relays (BOTH sources now)
      console.log(`App: Reached end of local videos (${uniqueVideoNotes.length}), fetching older (15+15) from relays...`);
      // Fetch older from authors
      if (authorVideoNotes.length > 0) {
        const oldestTimestamp = authorVideoNotes[authorVideoNotes.length - 1].created_at;
        setVideoFetchUntil(oldestTimestamp);
        console.log("App: Fetching older author videos (next 15)...");
      }
      // <<< Fetch older from tags >>>
      if (fetchVideosByTagEnabled && tagVideoNotes.length > 0) {
          const oldestTagTimestamp = tagVideoNotes[tagVideoNotes.length - 1].created_at;
          setVideoTagsFetchUntil(oldestTagTimestamp);
          console.log("App: Fetching older tag videos (next 15)...");
      }
    }
    // <<< Dependencies updated >>>
  }, [ uniqueVideoNotes, visibleVideoCount, authorVideoNotes, tagVideoNotes, fetchVideosByTagEnabled ]);

  // <<< Create memoized slice of unique video notes >>>
  const visibleVideoNotes = useMemo(() => {
    // Deduplicate based on URL first, then slice
    const urlMap = new Map<string, NostrNote>();
    combinedVideoNotes.forEach(note => {
      if (note.url && !urlMap.has(note.url)) {
        urlMap.set(note.url, note);
      }
    });
    const uniqueByUrlNotes = Array.from(urlMap.values()).sort((a, b) => b.created_at - a.created_at);
    setUniqueVideoNotes(uniqueByUrlNotes); // Update the state used for fetching older
    return uniqueByUrlNotes.slice(0, visibleVideoCount);
  }, [combinedVideoNotes, visibleVideoCount]);

  // Media state hook (pass memoized shuffled combined notes)
  const {
    viewMode,
    currentImageIndex,
    currentPodcastIndex,
    currentVideoIndex,
    handleVideoSelect,
    handlePrevious,
    handleNext,
    setViewMode,
    setCurrentPodcastIndex,
    imageNotes: stateImageNotes, // Prop name might differ from internal state name
    podcastNotes: statePodcastNotes,
    videoNotes: stateVideoNotes, // This will now receive uniqueVideoNotes derived from combinedVideoNotes
    currentItemUrl,
  } = useMediaState({
      initialImageNotes: shuffledImageNotes,
      initialPodcastNotes: memoizedPodcastNotes,
      initialVideoNotes: visibleVideoNotes, // <<< Pass sliced array
      fetchOlderImages: fetchOlderImages,
      fetchOlderVideos: fetchOlderVideos, // Pass the modified callback
      shuffledImageNotesLength: shuffledImageNotes.length,
      shuffledVideoNotesLength: visibleVideoNotes.length, // <<< Pass length of sliced array
  });

  // Effect for deduplicating video notes BY URL (using combinedVideoNotes)
  useEffect(() => {
    console.log('%%% App.tsx: Video Dedupe Effect RUNNING'); // <<< Add log
    // --- Deduplicate video notes by URL, keeping the newest ---
    const uniqueVideoNotesMap = new Map<string, NostrNote>();
    // <<< Use combinedVideoNotes now >>>
    for (const note of combinedVideoNotes) {
      if (note.url) {
        if (!uniqueVideoNotesMap.has(note.url) || note.created_at > (uniqueVideoNotesMap.get(note.url)?.created_at ?? 0)) {
          uniqueVideoNotesMap.set(note.url, note);
        }
      } else {
        console.warn(`App: Video note ${note.id} missing URL, skipping URL deduplication.`);
      }
    }
    const deduplicatedNotes = Array.from(uniqueVideoNotesMap.values())
      .sort((a, b) => b.created_at - a.created_at);
    console.log(`App: Deduplicated ${combinedVideoNotes.length} combined video notes to ${deduplicatedNotes.length} unique URLs.`);

    // Compare and set uniqueVideoNotes state (which feeds into useMediaState)
    const currentIds = uniqueVideoNotes.map(note => note.id).join(',');
    const newIds = deduplicatedNotes.map(note => note.id).join(',');

    // <<< Add logging before potential state update >>>
    console.log(`%%% App.tsx: Video Dedupe Check. Current IDs: ${currentIds.substring(0,50)}..., New IDs: ${newIds.substring(0,50)}...`);

    if (currentIds !== newIds) {
      console.log('%%% App.tsx: Video Dedupe Effect - UPDATING uniqueVideoNotes state.');
      setUniqueVideoNotes(deduplicatedNotes);
    } else {
      console.log('%%% App.tsx: Video Dedupe Effect - Skipping uniqueVideoNotes update.');
    }
    // Depend only on the input combinedVideoNotes state
  }, [combinedVideoNotes, uniqueVideoNotes]); // Add uniqueVideoNotes back to deps ? No, should derive from combinedVideoNotes

  // --- Inactivity Timer Setup ---
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);

  // --- Fullscreen Hook --- Pass reset function to onActivity
  const { isFullScreen, signalInteraction, signalMessage } = useFullscreen({
    interactionTimeout: INTERACTION_TIMEOUT,
    messageTimeout: MESSAGE_TIMEOUT,
    checkInterval: CHECK_INTERVAL,
  });

  // --- Function to Reset Inactivity Timer ---
  const resetInactivityTimer = useCallback(() => {
    console.log("App: Resetting inactivity timer.");
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }
    // Only set the timer if *not* currently fullscreen
    if (!isFullScreen) {
      inactivityTimerRef.current = setTimeout(() => {
        console.log("App: Inactivity timeout reached. Entering fullscreen.");
        if (!document.fullscreenElement) { // Double check before requesting
          signalInteraction(); // Enter fullscreen
        }
      }, FULLSCREEN_INACTIVITY_TIMEOUT);
    }
  }, [isFullScreen, signalInteraction]); // Add dependencies

  // --- Effect to Manage Inactivity Timer and Mouse Listener ---
  useEffect(() => {
    console.log("App: Setting up inactivity timer and listeners.");
    resetInactivityTimer(); // Start the timer initially

    // Add mouse move listener to reset timer
    window.addEventListener('mousemove', resetInactivityTimer);
    window.addEventListener('click', resetInactivityTimer); // Also reset on click

    // Cleanup function
    return () => {
      console.log("App: Cleaning up inactivity timer and listeners.");
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
      window.removeEventListener('mousemove', resetInactivityTimer);
      window.removeEventListener('click', resetInactivityTimer);
    };
  }, [resetInactivityTimer]); // Re-run if resetInactivityTimer changes (due to isFullScreen change)

  // Refs for media elements
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Determine active media ref and initial time based on viewMode
  const activeMediaRef = viewMode === 'videoPlayer' ? videoRef : audioRef;
  const playbackInitialTime = viewMode === 'imagePodcast' ? initialPodcastTime : 0;

  // --- Determine URLs and Active States for Playback Hooks ---
  const isAudioMode = viewMode === 'imagePodcast';
  const isVideoMode = viewMode === 'videoPlayer';

  // --- Instantiate Playback Hooks (One for each element) ---
  const audioPlayback = useMediaElementPlayback({
    mediaElementRef: audioRef,
    currentItemUrl: isAudioMode ? currentItemUrl : null,
    isActiveMode: isAudioMode,
    elementType: 'audio',
    onEnded: isAudioMode ? handleNext : undefined,
    initialTime: initialPodcastTime,
    autoplayEnabled: false,
    next: true,
  });

  const videoPlayback = useMediaElementPlayback({
    mediaElementRef: videoRef,
    currentItemUrl: isVideoMode ? currentItemUrl : null,
    isActiveMode: isVideoMode,
    elementType: 'video',
    onEnded: isVideoMode ? handleNext : undefined,
    initialTime: 0,
    autoplayEnabled: false,
    next: true,
  });

  // ... select activePlayback state/controls ...
  const activePlayback = isVideoMode ? videoPlayback : audioPlayback;
  // ... destructure activePlayback ...
  
  // Ref for ImageFeed component
  const imageFeedRef = useRef<ImageFeedRef>(null);

  // Function to focus the toggle button in ImageFeed
  const focusImageFeedToggle = useCallback(() => {
    if (imageFeedRef.current) {
      imageFeedRef.current.focusToggleButton();
    }
  }, []);

  // <<< Function to focus the settings button in RelayStatus >>>
  const handleFocusSettingsRequest = useCallback(() => {
    relayStatusRef.current?.focusSettingsButton();
  }, []); // <<< MOVED DEFINITION UP

  // Keyboard Controls Hook - Pass toggleFullScreen
  useKeyboardControls({
    isFullScreen,
    signalInteraction,
    onTogglePlayPause: activePlayback.togglePlayPause,
    onToggleFullScreen: signalInteraction,
  });

  // Image Carousel Hook (uses shuffledImageNotes derived from combinedImageNotes)
  const isCarouselActive = viewMode === 'imagePodcast' && combinedImageNotes.length > 1; // Check combined length
  useImageCarousel({
      isActive: isCarouselActive,
      onTick: handleNext,
      intervalDuration: IMAGE_CAROUSEL_INTERVAL,
  });

  // Current Author Hook (uses combinedImageNotes and uniqueVideoNotes)
  const currentAuthorNpub = useCurrentAuthor({
      viewMode,
      imageIndex: currentImageIndex,
      videoIndex: currentVideoIndex,
      imageNotes: combinedImageNotes,
      videoNotes: uniqueVideoNotes,
  });

  // --- NEW: Fetch Current Author Profile ---
  const currentAuthorHexPubkey = useMemo(() => {
    if (!currentAuthorNpub) return null;
    try {
      return nip19.decode(currentAuthorNpub).data as string;
    } catch (e) {
      console.error("Error decoding currentAuthorNpub:", e);
      return null;
    }
  }, [currentAuthorNpub]);

  const { profile: currentAuthorProfile, isLoading: isLoadingAuthorProfile } = useUserProfile(
    currentAuthorHexPubkey,
    ndkInstance
  );

  const authorProfilePictureUrl = currentAuthorProfile?.picture || null;
  // -----------------------------------------

  // --- Effect for Preload URL Calculation (uses uniqueVideoNotes) ---
  useEffect(() => {
    let urlToPreloadCalc: string | null = null; // Use different variable name
    if (uniqueVideoNotes.length > 0) {
      if (viewMode === 'videoPlayer') {
        // Preload NEXT video
        if (uniqueVideoNotes.length > 1) {
          const nextIndex = (currentVideoIndex + 1) % uniqueVideoNotes.length;
          urlToPreloadCalc = uniqueVideoNotes[nextIndex]?.url || null;
          if (urlToPreloadCalc) console.log(`App: Setting preload URL (next video): ${urlToPreloadCalc}`);
        }
      } else { // imagePodcast mode
        // Preload FIRST video
        urlToPreloadCalc = uniqueVideoNotes[0]?.url || null;
        // if (urlToPreloadCalc) console.log(`App: Setting preload URL (first video): ${urlToPreloadCalc}`); // Less noisy log
      }
    }
    // Update state only if changed
    if (preloadVideoUrl !== urlToPreloadCalc) {
       setPreloadVideoUrl(urlToPreloadCalc);
    }
  }, [viewMode, currentVideoIndex, uniqueVideoNotes, preloadVideoUrl]);

  // --- Effect to ACTUALLY PRELOAD the video --- <<< NEW EFFECT >>>
  useEffect(() => {
    if (preloadVideoUrl && preloadVideoRef.current) {
        console.log(`>>> App: Initiating preload for: ${preloadVideoUrl}`);
        preloadVideoRef.current.src = preloadVideoUrl;
        preloadVideoRef.current.load(); // Start loading metadata and potentially data
        // Optional: Add listeners to preloadVideoRef.current for debugging preload progress ('progress', 'canplay', 'error')
    } else {
        // console.log(">>> App: No preload URL or ref not ready.");
    }
  }, [preloadVideoUrl]); // Only run when the URL to preload changes

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const handleCloseSettings = useCallback(() => {
    setIsSettingsOpen(false);
  }, []);

  // Callback to toggle the settings modal state
  const toggleSettingsModal = useCallback(() => {
    setIsSettingsOpen(prev => !prev);
    signalInteraction(); // Also signal interaction when settings are toggled
  }, [signalInteraction]);

  // Global Loading/Error States
  // Note: We might not need this comprehensive isLoading flag if NDK connection
  // is handled by the parent App component wrapper.
  // const isLoading = isNdkConnecting ||
  //                   isLoadingAuthors ||
  //                   isLoadingPodcastNotes ||
  //                   isLoadingAuthorVideoNotes || (fetchVideosByTagEnabled && isLoadingTagVideoNotes) ||
  //                   isLoadingAuthorImages || (fetchImagesByTagEnabled && isLoadingTagImages);


  // <<< Add diagnostic logging before render >>>
  console.log(`App Render Diagnostics (Image Mode: ${viewMode === 'imagePodcast'}):`, {
    combinedImageNotesLength: combinedImageNotes.length,
    shuffledImageNotesLength: shuffledImageNotes.length,
    currentImageIndex: currentImageIndex,
    noteToDisplay: viewMode === 'imagePodcast' && currentImageIndex < shuffledImageNotes.length ? shuffledImageNotes[currentImageIndex] : 'N/A',
    isFeedLoading: isLoadingAuthorImages || isLoadingTagImages,
  });

  // <<< Add diagnostic logging for loading flags >>>
  console.log(`App Render Loading Flags:`, {
    isLoadingAuthorImages,
    isLoadingTagImages,
  });

  // <<< Add logging for playback hook dependencies >>>
  console.log(`App Render Playback Deps:`, {
    viewMode,
    isAudioMode, // -> isActiveMode for audio
    isVideoMode, // -> isActiveMode for video
    currentItemUrl,
  });

  // <<< RESTORED LOGGED-IN USER PROFILE LOGIC HERE >>>
  // --- Logged-in User Profile (For MessageBoard) ---
  const { profile: messageBoardCurrentUser } = useProfile({ pubkey: auth.currentUserNpub ?? undefined });
  // ---------------------------------------------------

  // --- JSX Structure ---
  return (
    <>
      {/* Outermost div */}
      <div className="relative flex flex-col min-h-screen h-screen text-white border-2 border-purple-900 bg-gradient-radial from-gray-900 via-black to-black">
        {/* Invisible Audio Element */}
        {/* <<< Hidden video element for preloading >>> */}
        <video ref={preloadVideoRef} className="hidden" muted playsInline preload="metadata"></video>
        <audio ref={audioRef} className="hidden" />
        {/* Video is rendered visibly inside VideoPlayer */}

        {/* Absolute Positioned Titles */}
        <h2 className="absolute top-2 right-4 z-20 text-base font-bold text-purple-600 pointer-events-none">
          Mad⚡tr.tv
        </h2>

        {/* Inner wrapper */}
        <div className="relative flex flex-col flex-grow min-h-0 overflow-hidden">
          {/* MediaFeed Area (Top Section) */}
          <div className="relative w-full flex-grow min-h-0 bg-black flex items-center justify-center overflow-hidden">
            {/* <<< NEW: Author Profile Picture (Always Visible) >>> */}
            {authorProfilePictureUrl && (
              <img
                src={authorProfilePictureUrl}
                alt="Author profile"
                className="absolute top-2 left-2 z-30 w-10 h-10 md:w-12 md:h-12 rounded-full border-2 border-purple-600 shadow-lg pointer-events-none"
              />
            )}
            {/* <<< End New Element >>> */}
            <AnimatePresence mode="wait">
              {isLoadingAuthors || isLoadingAuthorImages || isLoadingTagImages || isLoadingAuthorVideoNotes || isLoadingTagVideoNotes ? ( // Check all relevant loading states
                <motion.div
                  key="loading-notes" // Changed key to reflect general media loading
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="text-gray-400"
                >
                  {isLoadingAuthors ? "Loading author list..." : "Loading media..."}
                </motion.div>
              ) : viewMode === 'imagePodcast' ? (
                <motion.div
                  key="imageFeed"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5 }}
                  className="w-full h-full flex items-center justify-center"
                >
                  <ImageFeed
                    ref={imageFeedRef}
                    isLoading={isLoadingAuthorImages || isLoadingTagImages} // Check both image loading states
                    handlePrevious={handlePrevious}
                    handleNext={handleNext}
                    currentImageIndex={currentImageIndex}
                    imageNotes={shuffledImageNotes} // <<< Use SHUFFLED notes >>>
                    authorNpub={currentAuthorNpub}
                    authorProfilePictureUrl={authorProfilePictureUrl}
                    authorDisplayName={currentAuthorProfile?.name || currentAuthorProfile?.displayName || null}
                    isPlaying={false} // Audio playback is separate
                    togglePlayPause={() => { console.log('ImageFeed togglePlayPause called (no-op)'); }}
                    isFullScreen={isFullScreen}
                    signalInteraction={signalInteraction}
                  />
                </motion.div>
              ) : viewMode === 'videoPlayer' ? (
                <motion.div
                  key="videoPlayer"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5 }}
                  className="w-full h-full flex items-center justify-center"
                >
                  <VideoPlayer
                    videoRef={videoRef}
                    src={currentItemUrl} // Derived from uniqueVideoNotes via useMediaState
                    isPlaying={videoPlayback.isPlaying}
                    togglePlayPause={videoPlayback.togglePlayPause}
                    pause={videoPlayback.pause}
                    play={videoPlayback.play}
                    toggleMute={videoPlayback.toggleMute}
                    authorNpub={currentAuthorNpub}
                    // defaultTipAmount={auth.defaultTipAmount} // Pass default tip amount << REMOVED
                    // authorProfilePictureUrl={authorProfilePictureUrl} // <<< Pass picture URL - Commented out until VideoPlayer supports it >>>
                    autoplayFailed={videoPlayback.autoplayFailed}
                    isMuted={videoPlayback.isMuted}
                    currentNoteId={stateVideoNotes[currentVideoIndex]?.id} // stateVideoNotes is uniqueVideoNotes
                    // Pass necessary context as props
                    // ndkInstance={ndkInstance} // <<< REMOVE prop
                    // isNdkReady={isNdkReady} // <<< REMOVE prop
                    // auth={auth} // << REMOVED
                    // wallet={wallet} // << REMOVED
                  />
                </motion.div>
              ) : null}
            </AnimatePresence>

            {/* Duplicated Mode Toggle Button (Hide on Fullscreen) */}
            <AnimatePresence>
              {!isFullScreen && (
                <motion.button
                  key="top-toggle-button"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  onClick={() => setViewMode(viewMode === 'imagePodcast' ? 'videoPlayer' : 'imagePodcast')}
                  tabIndex={0}
                  className="absolute bottom-2 right-24 z-20 p-1.5 rounded
                                 bg-transparent text-purple-600
                                 hover:text-purple-100 hover:bg-black/70
                                 focus:outline-none focus:bg-transparent focus:text-purple-300
                                 focus:ring-2 focus:ring-gray-400 focus:ring-offset-1 focus:ring-offset-black
                                 transition-all duration-150 text-xs font-semibold uppercase"
                  aria-label={`Show ${viewMode === 'imagePodcast' ? 'Videos' : 'Images'}`}
                  title={`Show ${viewMode === 'imagePodcast' ? 'Videos' : 'Images'}`}
                >
                  {viewMode === 'imagePodcast' ? 'Videos' : 'Images'}
                </motion.button>
              )}
            </AnimatePresence>
            {/* Author QR Code is rendered inside ImageFeed/VideoPlayer */}
          </div>

          {/* Prev/Next Buttons (Hide on Fullscreen) */}
          <AnimatePresence>
            {!isFullScreen && (
              (viewMode === 'imagePodcast' && combinedImageNotes.length > 1) || // <<< Check combined length >>>
              (viewMode === 'videoPlayer' && uniqueVideoNotes.length > 1) // uniqueVideoNotes length is correct here
            ) && (
              <motion.div
                key="pagination-buttons"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                <>
                  {/* Prev Button */}
                  <button
                    onClick={handlePrevious}
                    className="absolute left-2 top-1/2 transform -translate-y-1/2 z-10 p-1.5 rounded
                                 bg-transparent text-purple-600
                                 hover:text-purple-100 hover:bg-black/70
                                 focus:outline-none focus:bg-transparent focus:text-purple-300
                                 focus:ring-2 focus:ring-gray-400 focus:ring-offset-1 focus:ring-offset-black
                                 transition-all duration-150 text-xs font-semibold uppercase"
                    aria-label="Previous Item"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 5 L 13 12 L 15 19" />
                    </svg>
                  </button>
                  {/* Next Button */}
                  <button
                    onClick={handleNext}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 z-10 p-1.5 rounded
                                 bg-transparent text-purple-600
                                 hover:text-purple-100 hover:bg-black/70
                                 focus:outline-none focus:bg-transparent focus:text-purple-300
                                 focus:ring-2 focus:ring-gray-400 focus:ring-offset-1 focus:ring-offset-black
                                 transition-all duration-150 text-xs font-semibold uppercase"
                    aria-label="Next Item"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5 L 11 12 L 9 19" />
                    </svg>
                  </button>
                </>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Animated Bottom Split Screen Container */}
          <AnimatePresence>
            {!isFullScreen && (
              <motion.div
                key="bottomPanel"
                className="relative w-full h-1/4 flex-shrink-0 flex flex-row overflow-hidden mt-2"
                initial={{ y: '100%', opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: '100%', opacity: 0 }}
                transition={{ duration: 0.5, ease: "easeInOut" }}
              >
                {/* Left Side: Message Board */}
                <div className="w-2/3 h-full pr-1 flex flex-col overflow-hidden">
                  <div className="w-full h-full max-w-4xl max-h-[80vh] p-4 rounded-lg overflow-hidden" onClick={(e) => e.stopPropagation()}> {/* Prevent closing on inner click */}
                    <MessageBoard
                      currentUser={messageBoardCurrentUser}
                      threadEventId={MAIN_THREAD_NEVENT_URI}
                      onNewMessage={signalMessage}
                      onRequestFocusSettings={handleFocusSettingsRequest} // <<< Pass focus callback
                    />
                  </div>
                </div>
                {/* Right Side: Media Panel - Adjust width */}
                <div className="w-1/3 h-full pl-1 flex flex-col">
                  <MediaPanel
                    // Refactor props based on context/hooks
                    audioRef={audioRef}
                    videoRef={videoRef}
                    viewMode={viewMode}
                    setViewMode={setViewMode}
                    podcastNotes={memoizedPodcastNotes} // Pass memoized notes
                    videoNotes={visibleVideoNotes} // Pass CORRECT visible subset
                    isLoadingPodcastNotes={isLoadingPodcastNotes}
                    isLoadingVideoNotes={isLoadingAuthorVideoNotes || isLoadingTagVideoNotes}
                    isPlaying={activePlayback.isPlaying}
                    currentTime={activePlayback.currentTime}
                    duration={activePlayback.duration}
                    playbackRate={activePlayback.playbackRate}
                    setPlaybackRate={activePlayback.setPlaybackRate}
                    togglePlayPause={activePlayback.togglePlayPause}
                    handleSeek={activePlayback.handleSeek}
                    currentItemUrl={currentItemUrl}
                    currentPodcastIndex={currentPodcastIndex}
                    setCurrentPodcastIndex={setCurrentPodcastIndex}
                    currentVideoIndex={currentVideoIndex}
                    onVideoSelect={handleVideoSelect}
                    authors={memoizedMediaAuthors} // Pass authors for profiles
                    signalInteraction={signalInteraction}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div> {/* End Inner Wrapper */}
      </div> {/* End Outermost Div */}

      {/* Relay Status (Bottom Left) */}
      <div className="absolute bottom-0 left-0 p-2 z-20">
        <RelayStatus
          ref={relayStatusRef} // <<< Pass the ref
          connectedCount={relayStats.connected}
          totalCount={RELAYS.length} // Use constant for total
          onOpenSettings={toggleSettingsModal} // Pass the correct callback
        />
      </div>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={handleCloseSettings}
      />
    </>
  );
}

// Main App component: Initializes NDK and sets up providers
const App: React.FC = () => {
  // <<< Get ndkInstance and isReady from useNDKInit >>>
  const { ndkInstance, isReady, connectionError } = useNDKInit();

  // Handle connection states
  // <<< Restore Loading State Check >>>
  if (!isReady && !connectionError) {
    return (
      <div className="flex items-center justify-center h-screen bg-black text-purple-400">
        Initializing Connection...
      </div>
    );
  }

  if (connectionError) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-black text-red-500">
        <p>Error connecting to Nostr network:</p>
        <p className="mt-2 text-sm text-gray-400">{connectionError.message}</p>
      </div>
    );
  }

  // NDK connection is ready
  return (
    <AuthProvider>
      <WalletProvider>
        {/* <<< Pass ndkInstance and isReady down >>> */}
        <AppContent ndkInstance={ndkInstance} isNdkReady={isReady} />
      </WalletProvider>
    </AuthProvider>
  );
};

export default App;

