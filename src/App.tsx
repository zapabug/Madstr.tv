import { useEffect, useCallback, useRef, useState } from 'react';
import QRCode from 'react-qr-code'; // Import QRCode
import ImageFeed, { ImageFeedRef } from './components/ImageFeed'; // Import props type if needed
import MessageBoard from './components/MessageBoard'; // Re-enable import
import MediaPanel from './components/MediaPanel'; // Removed MediaPanelProps import
import RelayStatus from './components/RelayStatus'; // Import the new component
import VideoPlayer from './components/VideoPlayer'; // <<< Import VideoPlayer
import { nip19 } from 'nostr-tools';
import { MAIN_THREAD_NEVENT_URI, RELAYS } from './constants';
import { useMediaAuthors } from './hooks/useMediaAuthors'; // Import the new hook
import { useMediaState } from './hooks/useMediaState'; // Import the new hook
import { useMediaElementPlayback } from './hooks/useMediaElementPlayback'; // <<< Import media playback hook
import { useMediaNotes } from './hooks/useMediaNotes'; // <<< Import the new hook
// NDKEvent/Filter no longer needed here directly
// import { NDKEvent, NDKFilter } from '@nostr-dev-kit/ndk'; 
// NostrNote type likely still needed for props
import { NostrNote } from './types/nostr'; // <<< Corrected path
import { shuffleArray } from './utils/shuffleArray'; // <<< Import shuffle utility
import { motion, AnimatePresence } from 'framer-motion'; // <<< Import framer-motion

// Public key for this TV instance (used for displaying QR code)
const TV_PUBKEY_NPUB = 'npub1a5ve7g6q34lepmrns7c6jcrat93w4cd6lzayy89cvjsfzzwnyc4s6a66d8';
// <<< Fullscreen Timeouts >>>
const INTERACTION_TIMEOUT = 30000; // 30 seconds
const MESSAGE_TIMEOUT = 120000; // 2 minutes
const CHECK_INTERVAL = 5000; // Check every 5 seconds

// Function to safely decode npub
function getHexPubkey(npub: string): string | null {
    try {
        const decoded = nip19.decode(npub);
        if (decoded.type === 'npub') {
            return decoded.data;
        }
        console.warn(`Decoded type is not npub: ${decoded.type}`);
        return null;
    } catch (e) {
        console.error(`Failed to decode npub ${npub}:`, e);
        return null;
    }
}

function App() {
  // Use the new hook to get NDK instance, authors, and loading state
  const { ndk, mediaAuthors, isLoadingAuthors } = useMediaAuthors();

  // <<< Add this console.log >>>
  console.log("App.tsx: useMediaAuthors returned:", { ndk: !!ndk, mediaAuthors, isLoadingAuthors });
  
  // State for fetch parameters
  const [imageFetchLimit, setImageFetchLimit] = useState<number>(200);
  const [videoFetchLimit, setVideoFetchLimit] = useState<number>(200);
  const [imageFetchUntil, setImageFetchUntil] = useState<number | undefined>(undefined);
  const [videoFetchUntil, setVideoFetchUntil] = useState<number | undefined>(undefined);

  // Fetch notes using dynamic parameters
  const { notes: podcastNotes, isLoading: isLoadingPodcastNotes } = useMediaNotes({ 
    authors: mediaAuthors, 
    mediaType: 'podcast', 
    ndk: ndk || null, 
    limit: 200 // Keep podcast limit fixed for now?
  });
  const { notes: videoNotes, isLoading: isLoadingVideoNotes } = useMediaNotes({ 
    authors: mediaAuthors, 
    mediaType: 'video', 
    ndk: ndk || null, 
    limit: videoFetchLimit, 
    until: videoFetchUntil 
  });
  const { notes: imageNotes, isLoading: isLoadingImages } = useMediaNotes({ 
    authors: mediaAuthors, 
    mediaType: 'image', 
    ndk: ndk || null, 
    limit: imageFetchLimit, 
    until: imageFetchUntil 
  });
  
  // State for shuffled notes for display
  const [shuffledImageNotes, setShuffledImageNotes] = useState<NostrNote[]>([]);
  const [shuffledVideoNotes, setShuffledVideoNotes] = useState<NostrNote[]>([]);

  // State for podcast saved position
  const [initialPodcastTime, setInitialPodcastTime] = useState<number>(0);

  // ---> Declare fetcher functions BEFORE useMediaState <--- 
  const fetchOlderImages = useCallback(() => {
    if (imageNotes.length > 0) {
      const oldestTimestamp = imageNotes[imageNotes.length - 1].created_at;
      console.log(`App: Fetching images older than ${new Date(oldestTimestamp * 1000).toISOString()}`);
      setImageFetchUntil(oldestTimestamp); 
    }
  }, [imageNotes]); 

  const fetchOlderVideos = useCallback(() => {
    if (videoNotes.length > 0) {
      const oldestTimestamp = videoNotes[videoNotes.length - 1].created_at;
      console.log(`App: Fetching videos older than ${new Date(oldestTimestamp * 1000).toISOString()}`);
      setVideoFetchUntil(oldestTimestamp); 
    }
  }, [videoNotes]); 

  // Ref to track previous view mode for fetch trigger
  const previousViewModeRef = useRef<typeof viewMode | undefined>(undefined);

  // ---> Call useMediaState, passing notes directly <--- 
  const {
    viewMode, 
    currentImageIndex,
    currentPodcastIndex,
    currentVideoIndex,
    selectedVideoNpub,
    currentItemUrl, 
    handleVideoSelect, 
    handlePrevious,
    handleNext, 
    setViewMode, 
    setCurrentPodcastIndex, 
    isLoadingPodcastNotes: isLoadingPodcastState,
    isLoadingVideoNotes: isLoadingVideoState,
  } = useMediaState({ 
      initialImageNotes: imageNotes, 
      initialPodcastNotes: podcastNotes,
      initialVideoNotes: videoNotes,
      fetchOlderImages: fetchOlderImages, 
      fetchOlderVideos: fetchOlderVideos,
      shuffledImageNotesLength: shuffledImageNotes.length,
      shuffledVideoNotesLength: shuffledVideoNotes.length,
  });

  // --- KEEP Effects for shuffling notes (This logic remains in App) ---
  useEffect(() => { 
    console.log(`App: Shuffling ${imageNotes.length} image notes.`);
    setShuffledImageNotes(shuffleArray([...imageNotes])); // Update shuffled state for UI
  }, [imageNotes]); // Depend only on the fetched notes

  // No separate effect for podcast shuffling

  useEffect(() => { 
    console.log(`App: Shuffling ${videoNotes.length} video notes.`);
    setShuffledVideoNotes(shuffleArray([...videoNotes])); // Update shuffled state for UI
  }, [videoNotes]); // Depend only on the fetched notes

  // --- Calculate current author npub --- <<< NEW LOGIC
  const [currentAuthorNpub, setCurrentAuthorNpub] = useState<string | null>(null);
  useEffect(() => {
    let authorPubkey: string | undefined = undefined;
    if (viewMode === 'imagePodcast' && shuffledImageNotes.length > 0 && currentImageIndex >= 0) {
        authorPubkey = shuffledImageNotes[currentImageIndex]?.pubkey;
    } else if (viewMode === 'videoPlayer' && shuffledVideoNotes.length > 0 && currentVideoIndex >= 0) {
        authorPubkey = shuffledVideoNotes[currentVideoIndex]?.pubkey;
    }

    if (authorPubkey) {
        try {
            const npub = nip19.npubEncode(authorPubkey);
            setCurrentAuthorNpub(`nostr:${npub}`);
        } catch (e) {
            console.error("App: Failed to encode author pubkey:", authorPubkey, e);
            setCurrentAuthorNpub(null);
        }
    } else {
        setCurrentAuthorNpub(null);
    }
  }, [viewMode, currentImageIndex, currentVideoIndex, shuffledImageNotes, shuffledVideoNotes]);

  // --- State for Fullscreen Logic ---
  const [lastMessageTimestamp, setLastMessageTimestamp] = useState<number>(Date.now());
  const [lastInteractionTimestamp, setLastInteractionTimestamp] = useState<number>(Date.now()); // <<< New state
  const [isFullScreen, setIsFullScreen] = useState<boolean>(false);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null); // <<< Ref for interval timer

  // --- Callback for MessageBoard ---
  const handleNewMessage = useCallback(() => {
      console.log("App: New message received, updating timestamps.");
      const now = Date.now();
      setLastMessageTimestamp(now);
      setLastInteractionTimestamp(now); // <<< Also update interaction time
      if (isFullScreen) {
          console.log("App: Exiting fullscreen due to new message.");
          setIsFullScreen(false); // Exit fullscreen on new message
      }
      // No need to manage timer here, the effect handles it
  }, [isFullScreen]); // <<< Added isFullScreen dependency

  // --- Effect for Fullscreen Checks (Replaces previous timer effect) ---
  useEffect(() => {
      // Cleanup function to clear any existing interval
      const cleanup = () => {
          if (checkIntervalRef.current) {
              // console.log("App Fullscreen Effect: Clearing interval timer.");
              clearInterval(checkIntervalRef.current);
              checkIntervalRef.current = null;
          }
      };

      // If we are already fullscreen, clear any running timer and do nothing else
      if (isFullScreen) {
          cleanup();
          return;
      }

      // --- If NOT fullscreen, start the periodic check ---
      const checkFullScreen = () => {
          const now = Date.now();
          const timeSinceInteraction = now - lastInteractionTimestamp;
          const timeSinceMessage = now - lastMessageTimestamp;

          // console.log(`App Fullscreen Check: Interaction=${timeSinceInteraction}ms, Message=${timeSinceMessage}ms`);

          // Check if either condition is met to ENTER fullscreen
          if (timeSinceInteraction >= INTERACTION_TIMEOUT || timeSinceMessage >= MESSAGE_TIMEOUT) {
              console.log("App Fullscreen Check: Timeout met, entering fullscreen.");
              setIsFullScreen(true); // This will trigger the effect cleanup
          }
      };

      // Clear any previous interval before starting a new one
      cleanup();
      // Start the check immediately and then set the interval
      checkFullScreen();
      checkIntervalRef.current = setInterval(checkFullScreen, CHECK_INTERVAL);
      console.log("App Fullscreen Effect: Started interval timer.");

      // Return the cleanup function to clear interval on unmount or when isFullScreen becomes true
      return cleanup;

  // Depend on the state variables that affect the check conditions
  }, [isFullScreen, lastInteractionTimestamp, lastMessageTimestamp]);

  // --- <<< NEW Effect: Fetch older videos on switching TO video mode >>> ---
  useEffect(() => {
    // Check if mode just switched *to* videoPlayer
    if (viewMode === 'videoPlayer' && previousViewModeRef.current !== 'videoPlayer') {
      console.log("App: View mode just switched to videoPlayer, triggering fetchOlderVideos.");
      // Check if already fetching to prevent multiple simultaneous requests if switching quickly
      // (Assuming isLoadingVideoNotes reflects fetching older notes too - might need refinement)
      if (!isLoadingVideoState) { 
          fetchOlderVideos(); // Call the fetcher
      } else {
           console.log("App: Skipping fetchOlderVideos trigger, already loading videos.");
      }
    }
    // Update previous mode ref *after* the check
    previousViewModeRef.current = viewMode;
  }, [viewMode, fetchOlderVideos, isLoadingVideoState]); // Dependencies

  // Refs for media elements (will be passed to MediaPanel)
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Determine active media ref and initial time based on viewMode
  const activeMediaRef = viewMode === 'videoPlayer' ? videoRef : audioRef;
  const playbackInitialTime = viewMode === 'imagePodcast' ? initialPodcastTime : 0;

  // Media Playback Hook - Configured based on viewMode
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
    toggleMute,
  } = useMediaElementPlayback({
    mediaElementRef: activeMediaRef as React.RefObject<HTMLMediaElement>,
    currentItemUrl: currentItemUrl, 
    viewMode: viewMode,
    onEnded: handleNext, 
    initialTime: playbackInitialTime, 
  });

  // <<< Ref for ImageFeed component >>>
  const imageFeedRef = useRef<ImageFeedRef>(null);

  // <<< NEW: Function to focus the toggle button in ImageFeed >>>
  const focusImageFeedToggle = useCallback(() => {
    console.log("App: focusImageFeedToggle function called.");
    if (imageFeedRef.current) {
      console.log("App: Focusing ImageFeed toggle button via ref...");
      imageFeedRef.current.focusToggleButton();
    }
  }, []);

  // --> Use the nevent URI directly for the QR code value <--
  const qrValue = MAIN_THREAD_NEVENT_URI || '';
  if (!qrValue) {
      console.warn("App.tsx: MAIN_THREAD_NEVENT_URI is not set in constants.ts. QR code will be empty.");
  }

  // Placeholder for relay status
  const isReceivingData = false; 

  // --- Keyboard Listener (Updated for Fullscreen Exit) ---
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // <<< Update interaction timestamp and exit fullscreen >>>
      setLastInteractionTimestamp(Date.now());
      if (isFullScreen) {
          console.log("App: Exiting fullscreen due to remote interaction.");
          setIsFullScreen(false);
          // Decide if you want to prevent the default action. Often not needed just for exiting FS.
          // event.preventDefault();
      }
      // <<< End Fullscreen Exit Logic >>>

      console.log(`App: Key event - Key: ${event.key}, Code: ${event.code}, Mode: ${viewMode}`);

      // --- Existing Key Handling --- (No changes needed below unless desired)
      if (event.key === 'Escape' || event.key === 'Backspace' || event.key === 'Back') {
          // ... back logic ...
      }
      // ... other specific key logic ...
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  // Update dependencies: Add isFullScreen
  }, [viewMode, setViewMode, togglePlayPause, isFullScreen]); // <<< Added isFullScreen dependency

  // --- Effect to Trigger Play on Mode Switch to Video --- 
  useEffect(() => {
      // if (viewMode === 'videoPlayer' && currentItemUrl && !isPlaying) { // <<< Correct comparison done
      // ...
      // }
  }, [viewMode, currentItemUrl, play, isPlaying]); // Keep dependencies for play effect

  // --- <<< NEW: Image Carousel Timer Effect >>> ---
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;

    // Start timer only if in image mode and have multiple images
    if (viewMode === 'imagePodcast' && shuffledImageNotes.length > 1) {
      console.log("App: Starting image carousel timer (45s).");
      intervalId = setInterval(() => {
        console.log("App: Carousel timer fired, calling handleNext.");
        handleNext(); // Call the existing next handler
      }, 45000); // 45 seconds
    }

    // Cleanup function: Clear timer if it exists
    return () => {
      if (intervalId) {
        console.log("App: Clearing image carousel timer.");
        clearInterval(intervalId);
      }
    };

    // Re-run effect if mode, notes list, or handleNext changes
  }, [viewMode, shuffledImageNotes.length, handleNext]); 

  // ... return JSX ...

  return (
    <>
    {/* Outermost div: Remove pt-4 */}
    <div className="relative flex flex-col min-h-screen h-screen text-white border-2 border-purple-900 bg-gradient-radial from-gray-900 via-black to-black">

      {/* ---> INVISIBLE AUDIO & VIDEO ELEMENTS <--- */}
      <audio
        ref={audioRef}
        // Conditionally set src ONLY when in podcast mode AND url exists
        // Pass undefined otherwise to satisfy TS and prevent empty string warning
        src={viewMode === 'imagePodcast' && currentItemUrl ? currentItemUrl : undefined}
        onLoadedMetadata={() => console.log("App: Audio metadata loaded.")}
        onError={(e) => console.error("App: Audio element error:", e)}
        className="hidden"
      />
      {/* Video is rendered visibly inside VideoPlayer */}

      {/* Absolute Positioned Titles (Adjusted styling) */}
      <h2 className="absolute top-2 right-4 z-20 text-base font-bold text-purple-600 pointer-events-none">
        Mad⚡tr.tv
      </h2>

      {/* --- Bottom Left Area (QR Code and Relay Status - UNCHANGED POSITION) --- */}
       <div className="absolute bottom-4 left-4 z-10 flex flex-col items-center">
           {/* Reply QR Code Container */}
           <div className="bg-white p-1.5 rounded-md shadow-lg w-20 h-20 md:w-24 md:h-24 lg:w-28 lg:h-28 mb-1"> {/* Slightly larger QR */}
               {qrValue ? (
                 <QRCode
                   value={qrValue}
                   size={256}
                   style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                   viewBox={`0 0 256 256`}
                   level="L"
                 />
               ) : (
                 <div className="w-full h-full flex items-center justify-center text-black text-xs text-center">No Thread ID</div>
               )}
           </div>
           <p className="text-xs text-gray-400 font-semibold">Reply here</p>
       </div>
       {/* Relay Status Display - REMOVED from here */}
       {/* <div className="mt-1">
         <RelayStatus 
            isReceivingData={isReceivingData} 
            relayCount={RELAYS.length} // <<< Pass relay count
        />
       </div> */}

      {/* Inner wrapper: Fills space below padding */}
      <div className="relative flex flex-col flex-grow min-h-0 overflow-hidden">

        {/* MediaFeed Area (Top Section) - Always flex-grow */}
         <div className="relative w-full flex-grow min-h-0 bg-black flex items-center justify-center overflow-hidden">
              {/* AnimatePresence for transitions */}
              <AnimatePresence mode='wait'>
                 {isLoadingAuthors ? (
                     <motion.div
                         key="loading-authors"
                         initial={{ opacity: 0 }}
                         animate={{ opacity: 1 }}
                         exit={{ opacity: 0 }}
                         transition={{ duration: 0.3 }}
                         className="text-gray-400"
                      >
                         Loading author list...
                     </motion.div>
                 ) : viewMode === 'imagePodcast' ? (
                     <motion.div
                         key="imageFeed"
                         initial={{ opacity: 0 }}
                         animate={{ opacity: 1 }}
                         exit={{ opacity: 0 }}
                         transition={{ duration: 0.5 }}
                         className="w-full h-full flex items-center justify-center" // Ensure div fills space
                     >
                         <ImageFeed
                             ref={imageFeedRef}
                             isLoading={isLoadingImages}
                             handlePrevious={handlePrevious}
                             handleNext={handleNext}
                             currentImageIndex={currentImageIndex}
                             imageNotes={shuffledImageNotes}
                             authorNpub={currentAuthorNpub} // <<< Pass author npub
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
                             src={currentItemUrl}
                             isPlaying={isPlaying}
                             togglePlayPause={togglePlayPause}
                             authorNpub={currentAuthorNpub}
                             autoplayFailed={autoplayFailed} // <<< Pass prop
                             isMuted={isMuted}             // <<< Pass prop
                         />
                     </motion.div>
                 ) : null }
              </AnimatePresence>

              {/* <<< NEW: Duplicated Mode Toggle Button (Hide on Fullscreen) >>> */}
              <AnimatePresence>
                {!isFullScreen && (
                  <motion.button
                      key="top-toggle-button" // Unique key for AnimatePresence
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      // --- Button props ---
                      onClick={() => setViewMode(viewMode === 'imagePodcast' ? 'videoPlayer' : 'imagePodcast')}
                      tabIndex={0}
                      // --- Change default text color to purple-600 ---
                      className="absolute bottom-2 right-24 z-20 p-1.5 rounded
                                 bg-transparent text-purple-600 // Keep BG, Updated Text
                                 hover:text-purple-100 hover:bg-black/70 // Original Hover
                                 focus:outline-none focus:bg-transparent focus:text-purple-300 // Keep Focus: Transparent BG, Original Text
                                 focus:ring-2 focus:ring-gray-400 focus:ring-offset-1 focus:ring-offset-black // Keep Focus: Gray Ring
                                 transition-all duration-150 text-xs font-semibold uppercase"
                      aria-label={`Show ${viewMode === 'imagePodcast' ? 'Videos' : 'Images'}`}
                      title={`Show ${viewMode === 'imagePodcast' ? 'Videos' : 'Images'}`}
                  >
                      {viewMode === 'imagePodcast' ? 'Videos' : 'Images'}
                  </motion.button>
                )}
              </AnimatePresence>
              {/* The Author QR Code is rendered *inside* ImageFeed/VideoPlayer at bottom-2 right-2 */}

         </div>

        {/* ---> Prev/Next Buttons (Hide on Fullscreen) <--- */}
        <AnimatePresence>
          {!isFullScreen && (
            // Render based on shuffled notes length AND fullscreen state
            (viewMode === 'imagePodcast' && shuffledImageNotes.length > 1) ||
            (viewMode === 'videoPlayer' && shuffledVideoNotes.length > 1)
          ) && (
             <motion.div
                 key="pagination-buttons"
                 initial={{ opacity: 0 }}
                 animate={{ opacity: 1 }}
                 exit={{ opacity: 0 }}
                 transition={{ duration: 0.3 }}
             >
                {/* <<< Button container now inside motion.div >>> */}
                {/* Need to wrap buttons in a fragment or div if motion.div can't directly wrap multiple elements */}
                <>
                  {/* Prev Button */}
                  <button
                      onClick={handlePrevious}
                      // --- Change default text color to purple-600 ---
                      className="absolute left-2 top-1/2 transform -translate-y-1/2 z-10 p-1.5 rounded
                                 bg-transparent text-purple-600 // Keep BG, Updated Text
                                 hover:text-purple-100 hover:bg-black/70 // Copied Hover
                                 focus:outline-none focus:bg-transparent focus:text-purple-300 // Copied Focus BG/Text
                                 focus:ring-2 focus:ring-gray-400 focus:ring-offset-1 focus:ring-offset-black // Copied Focus Ring
                                 transition-all duration-150 text-xs font-semibold uppercase"
                      aria-label="Previous Item"
                  >
                      {/* Adjusted SVG size, Restored Path */}
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          {/* <<< Restored original path for Prev >>> */}
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 5 L 13 12 L 15 19" />
                      </svg>
                  </button>
                  {/* Next Button */}
                  <button
                      onClick={handleNext}
                      // --- Change default text color to purple-600 ---
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 z-10 p-1.5 rounded
                                 bg-transparent text-purple-600 // Keep BG, Updated Text
                                 hover:text-purple-100 hover:bg-black/70 // Copied Hover
                                 focus:outline-none focus:bg-transparent focus:text-purple-300 // Copied Focus BG/Text
                                 focus:ring-2 focus:ring-gray-400 focus:ring-offset-1 focus:ring-offset-black // Copied Focus Ring
                                 transition-all duration-150 text-xs font-semibold uppercase"
                      aria-label="Next Item"
                  >
                      {/* Adjusted SVG size, Restored Path */}
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          {/* <<< Restored original path for Next >>> */}
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5 L 11 12 L 9 19" />
                      </svg>
                  </button>
                </>
             </motion.div>
           )
        }
        </AnimatePresence>

        {/* --- Animated Bottom Split Screen Container --- */}
        <AnimatePresence>
            {!isFullScreen && (
                 <motion.div
                    key="bottomPanel"
                    className="relative w-full h-1/4 flex-shrink-0 flex flex-row overflow-hidden mt-2" // Adjusted height/margin
                    initial={{ y: '100%', opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: '100%', opacity: 0 }}
                    transition={{ duration: 0.5, ease: "easeInOut" }}
                 >
                    {/* Message Board Container */}
                    <div className="w-2/3 h-full flex-shrink-0 overflow-y-auto bg-gray-900/80 rounded-lg backdrop-blur-sm p-2"> {/* Subtle background, padding */}
                        {ndk ? (
                            <MessageBoard
                              ndk={ndk}
                              neventToFollow={MAIN_THREAD_NEVENT_URI}
                              authors={mediaAuthors}
                              onNewMessage={handleNewMessage} // <<< Pass callback
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center"> {/* Centering placeholder */}
                                <p className="text-gray-400">Initializing Nostr connection...</p>
                            </div>
                        )}
                    </div> {/* End Message Board Container */}

                    {/* Interactive Panel Container (Right 1/3) */}
                    <div className="w-1/3 h-full flex flex-col overflow-hidden ml-2"> {/* Adjusted margin */}
                        <div className="flex-grow min-h-0 bg-gray-800/80 rounded-lg p-2 backdrop-blur-sm"> {/* Subtle background, padding */}
                            {ndk ? (
                                <MediaPanel
                                    audioRef={audioRef}
                                    videoRef={videoRef}
                                    viewMode={viewMode}
                                    authors={mediaAuthors} // Pass authors if needed by MediaPanel styling/logic
                                    podcastNotes={podcastNotes} // Original order for list
                                    videoNotes={shuffledVideoNotes} // Shuffled for list
                                    isLoadingPodcastNotes={isLoadingPodcastState} // Use state hook loading
                                    isLoadingVideoNotes={isLoadingVideoState} // Use state hook loading
                                    isPlaying={isPlaying}
                                    currentTime={currentTime}
                                    duration={duration}
                                    playbackRate={playbackRate}
                                    currentItemUrl={currentItemUrl} // Needed? Or handled by refs? Check MediaPanel
                                    setPlaybackRate={setPlaybackRate}
                                    togglePlayPause={togglePlayPause}
                                    handleSeek={handleSeek} // Check if MediaPanel uses this directly
                                    currentPodcastIndex={currentPodcastIndex}
                                    currentVideoIndex={currentVideoIndex}
                                    setCurrentPodcastIndex={setCurrentPodcastIndex}
                                    onVideoSelect={handleVideoSelect}
                                    setViewMode={setViewMode}
                                    // Pass focus handlers if needed based on focus-trap-issue.md
                                    // onFocusBottomEdge={focusImageFeedToggle} // Example if needed
                                    // onFocusRightEdge={focusImageFeedToggle} // Example if needed
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-gray-400">Initializing...</div>
                            )}
                        </div>
                    </div> {/* End Interactive Panel */}
                 </motion.div>
            )}
        </AnimatePresence>

      </div> {/* End Inner Wrapper */}
    </div> {/* End Outermost Div */}

    {/* --- Relay Status (Now Bottom Left) --- */}
    {/* Wrap RelayStatus in an absolutely positioned div */}
    <div className="absolute bottom-0 left-0 p-2 z-20">
      <RelayStatus
        isReceivingData={!!ndk} // Pass a boolean based on NDK presence
        relayCount={RELAYS.length} // Pass the count of configured relays
      />
    </div>

    </>
  );
}

export default App;

// Helper Regexes (can be defined here or in a utils file)
const imageRegex = /https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp)/i;
const videoRegex = /https?:\/\/\S+\.(?:mp4|mov|webm|m3u8)/i;
const audioRegex = /https?:\/\/\S+\.(?:mp3|m4a|ogg|aac|wav)/i;
