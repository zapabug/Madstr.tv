import { useEffect, useCallback, useRef, useState } from 'react';
import QRCode from 'react-qr-code';
import ndkInstance from './ndk'; // <-- Import the singleton NDK instance
import ImageFeed, { ImageFeedRef } from './components/ImageFeed';
import MediaPanel from './components/MediaPanel';
import RelayStatus from './components/RelayStatus';
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
import { useNDKInit } from './hooks/useNDKInit'; // <-- Import the new hook
import { NostrNote } from './types/nostr';
import { shuffleArray } from './utils/shuffleArray';
import { motion, AnimatePresence } from 'framer-motion';
import SettingsModal from './components/SettingsModal';
import { useAuth } from './hooks/useAuth';
import { useWallet } from './hooks/useWallet'; // <<< Import useWallet >>>
import MessageBoard from './components/MessageBoard'; // <-- Import MessageBoard

// Fullscreen Timeouts
const INTERACTION_TIMEOUT = 30000; // 30 seconds
const MESSAGE_TIMEOUT = 120000; // 2 minutes
const CHECK_INTERVAL = 5000; // Check every 5 seconds

// --- Constants ---
const IMAGE_CAROUSEL_INTERVAL = 45000; // 45 seconds

function App() {
  // --- NDK Initialization (Using Hook) ---
  const { isConnecting: isNdkConnecting, connectionError: ndkConnectionError, ndkInstance } = useNDKInit();
  const isNdkReady = !!ndkInstance && !isNdkConnecting && !ndkConnectionError;

  // Use the authors hook, passing the singleton ndk instance
  const { mediaAuthors, isLoadingAuthors } = useMediaAuthors({ ndk: ndkInstance });

  // --- Auth Hook --- 
  const auth = useAuth(ndkInstance);
  const { followedTags } = auth;

  // --- Wallet Hook --- <<< Initialize useWallet here >>>
  const wallet = useWallet({ ndkInstance, isNdkReady });

  // State for fetch parameters
  const [imageFetchLimit] = useState<number>(500);
  const [videoFetchLimit] = useState<number>(30);
  const [imageFetchUntil, setImageFetchUntil] = useState<number | undefined>(undefined);
  const [videoFetchUntil, setVideoFetchUntil] = useState<number | undefined>(undefined);

  // Fetch notes using dynamic parameters
  const { notes: podcastNotes, isLoading: isLoadingPodcastNotes } = useMediaNotes({ 
    authors: mediaAuthors, 
    mediaType: 'podcast', 
    ndk: ndkInstance, 
    limit: 25
  });
  const { notes: videoNotes, isLoading: isLoadingVideoNotes } = useMediaNotes({ 
    authors: mediaAuthors, 
    mediaType: 'video', 
    ndk: ndkInstance, 
    limit: videoFetchLimit,
    until: videoFetchUntil,
    followedTags: followedTags
  });
  const { notes: imageNotes, isLoading: isLoadingImages } = useMediaNotes({ 
    authors: mediaAuthors, 
    mediaType: 'image', 
    ndk: ndkInstance, 
    limit: imageFetchLimit,
    until: imageFetchUntil,
    followedTags: followedTags
  });
  
  // State for shuffled notes for display
  const [shuffledImageNotes, setShuffledImageNotes] = useState<NostrNote[]>([]);
  const [uniqueVideoNotes, setUniqueVideoNotes] = useState<NostrNote[]>([]);

  // State for podcast saved position
  const [initialPodcastTime] = useState<number>(0);

  // State for preload URL
  const [preloadVideoUrl, setPreloadVideoUrl] = useState<string | null>(null);

  // Fetcher functions
  const fetchOlderImages = useCallback(() => {
    if (imageNotes.length > 0) {
      const oldestTimestamp = imageNotes[imageNotes.length - 1].created_at;
      setImageFetchUntil(oldestTimestamp); 
    }
  }, [imageNotes]); 

  const fetchOlderVideos = useCallback(() => {
    if (videoNotes.length > 0) {
      const oldestTimestamp = videoNotes[videoNotes.length - 1].created_at;
      setVideoFetchUntil(oldestTimestamp); 
    }
  }, [videoNotes]); 

  // Media state hook
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
    imageNotes: stateImageNotes, 
    podcastNotes: statePodcastNotes, 
    videoNotes: stateVideoNotes,
    currentItemUrl,
  } = useMediaState({ 
      initialImageNotes: shuffledImageNotes, 
      initialPodcastNotes: podcastNotes,
      initialVideoNotes: uniqueVideoNotes,
      fetchOlderImages: fetchOlderImages, 
      fetchOlderVideos: fetchOlderVideos,
      shuffledImageNotesLength: shuffledImageNotes.length,
      shuffledVideoNotesLength: uniqueVideoNotes.length,
  });

  // Effects for shuffling notes
  useEffect(() => {
    console.log('App.tsx: Effect running: Shuffling imageNotes'); // Log effect run
    setShuffledImageNotes(shuffleArray([...imageNotes]));
  }, [imageNotes]);

  useEffect(() => {
    console.log('App.tsx: Effect running: Deduplicating videoNotes (No Shuffling)'); // Log effect run
    // --- Deduplicate video notes by URL, keeping the newest --- 
    const uniqueVideoNotesMap = new Map<string, NostrNote>();
    for (const note of videoNotes) {
        // Ensure URL exists before adding to map
        if (note.url) { 
            // If URL not seen, or this note is newer than the one stored, update map
             if (!uniqueVideoNotesMap.has(note.url) || note.created_at > (uniqueVideoNotesMap.get(note.url)?.created_at ?? 0)) {
                 uniqueVideoNotesMap.set(note.url, note);
             }
        } else {
             console.warn(`App: Video note ${note.id} missing URL, skipping deduplication.`);
        }
    }
    // Sort by created_at descending *after* deduplication
    const deduplicatedNotes = Array.from(uniqueVideoNotesMap.values())
                                  .sort((a, b) => b.created_at - a.created_at); 
    console.log(`App: Deduplicated ${videoNotes.length} video notes to ${deduplicatedNotes.length} unique URLs.`);

    // --- Set the unique, unshuffled video notes --- 
    setUniqueVideoNotes(deduplicatedNotes); // <-- No shuffleArray() call

  }, [videoNotes]);

  // Fullscreen hook
  const { isFullScreen, signalInteraction, signalMessage } = useFullscreen({
    interactionTimeout: INTERACTION_TIMEOUT,
    messageTimeout: MESSAGE_TIMEOUT,
    checkInterval: CHECK_INTERVAL,
  });

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
    autoplayEnabled: true,
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

  // Use the nevent URI directly for the QR code value
  const qrValue = MAIN_THREAD_NEVENT_URI || '';
  if (!qrValue) {
      console.warn("App.tsx: MAIN_THREAD_NEVENT_URI is not set in constants.ts. QR code will be empty.");
  }

  // Keyboard Controls Hook
  useKeyboardControls({
    isFullScreen,
    signalInteraction, 
    onSetViewMode: setViewMode, 
    onTogglePlayPause: activePlayback.togglePlayPause,
    onNext: handleNext, 
    onPrevious: handlePrevious, 
    onFocusToggle: focusImageFeedToggle, 
    viewMode,
  });

  // Image Carousel Hook
  const isCarouselActive = viewMode === 'imagePodcast' && shuffledImageNotes.length > 1;
  useImageCarousel({
      isActive: isCarouselActive,
      onTick: handleNext, 
      intervalDuration: IMAGE_CAROUSEL_INTERVAL,
  });

  // Current Author Hook
  const currentAuthorNpub = useCurrentAuthor({
      viewMode,
      imageIndex: currentImageIndex,
      videoIndex: currentVideoIndex,
      imageNotes: shuffledImageNotes,
      videoNotes: uniqueVideoNotes,
  });

  // --- Effect for Preload URL Calculation ---
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
        if (urlToPreloadCalc) console.log(`App: Setting preload URL (first video): ${urlToPreloadCalc}`);
      }
    }
    // Update state only if changed
    if (preloadVideoUrl !== urlToPreloadCalc) {
       setPreloadVideoUrl(urlToPreloadCalc);
    }
  }, [viewMode, currentVideoIndex, uniqueVideoNotes, preloadVideoUrl]);

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
  const isLoading = isNdkConnecting || isLoadingAuthors || isLoadingPodcastNotes || isLoadingVideoNotes || isLoadingImages;

  if (isNdkConnecting) {
    return (
      <div className="flex items-center justify-center h-screen bg-black text-white">
        Connecting to Nostr Relays...
      </div>
    );
  }

  if (ndkConnectionError) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-black text-red-500">
        <p>Error connecting to Nostr Relays:</p>
        <p>{ndkConnectionError.message}</p>
        <p className="mt-4 text-gray-400 text-sm">Please check console or try refreshing.</p>
      </div>
    );
  }

  return (
    <>
    {/* Outermost div */}
    <div className="relative flex flex-col min-h-screen h-screen text-white border-2 border-purple-900 bg-gradient-radial from-gray-900 via-black to-black">

      {/* Invisible Audio Element */}
      <audio
        ref={audioRef}
        className="hidden"
      />
      {/* Video is rendered visibly inside VideoPlayer */}

      {/* Absolute Positioned Titles */}
      <h2 className="absolute top-2 right-4 z-20 text-base font-bold text-purple-600 pointer-events-none">
        Mad⚡tr.tv
      </h2>

      {/* Bottom Left Area (QR Code) */}
       <div className="absolute bottom-4 left-4 z-10 flex flex-col items-center">
           {/* Reply QR Code Container */}
           <div className="bg-white p-1.5 rounded-md shadow-lg w-20 h-20 md:w-24 md:h-24 lg:w-28 lg:h-28 mb-1">
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

      {/* Inner wrapper */}
      <div className="relative flex flex-col flex-grow min-h-0 overflow-hidden">

        {/* MediaFeed Area (Top Section) */}
         <div className="relative w-full flex-grow min-h-0 bg-black flex items-center justify-center overflow-hidden">
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
                         className="w-full h-full flex items-center justify-center"
                     >
                         <ImageFeed
                             ref={imageFeedRef}
                             isLoading={isLoadingImages}
                             handlePrevious={handlePrevious}
                             handleNext={handleNext}
                             currentImageIndex={currentImageIndex}
                             imageNotes={shuffledImageNotes}
                             authorNpub={currentAuthorNpub}
                             isPlaying={false}
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
                             src={currentItemUrl} 
                             isPlaying={videoPlayback.isPlaying}
                             togglePlayPause={videoPlayback.togglePlayPause}
                             authorNpub={currentAuthorNpub}
                             autoplayFailed={videoPlayback.autoplayFailed}
                             isMuted={videoPlayback.isMuted}
                             currentNoteId={stateVideoNotes[currentVideoIndex]?.id}
                             // Pass necessary context as props
                             ndkInstance={ndkInstance}
                             isNdkReady={isNdkReady}
                             auth={auth}
                             wallet={wallet}
                         />
                     </motion.div>
                 ) : null }
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
            (viewMode === 'imagePodcast' && shuffledImageNotes.length > 1) ||
            (viewMode === 'videoPlayer' && uniqueVideoNotes.length > 1)
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
           )
        }
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
                        <MessageBoard 
                            ndk={ndkInstance}
                            threadEventId={MAIN_THREAD_NEVENT_URI}
                            onNewMessage={signalMessage}
                            isReady={isNdkReady}
                        />
                    </div>
                    {/* Right Side: Media Panel - Adjust width */}
                    <div className="w-1/3 h-full pl-1 flex flex-col"> 
                        <MediaPanel
                            viewMode={viewMode}
                            audioRef={audioRef}
                            videoRef={videoRef}
                            podcastNotes={statePodcastNotes}
                            videoNotes={stateVideoNotes}
                            isLoadingPodcastNotes={isLoadingPodcastNotes}
                            isLoadingVideoNotes={isLoadingVideoNotes}
                            currentPodcastIndex={currentPodcastIndex}
                            currentVideoIndex={currentVideoIndex}
                            setCurrentPodcastIndex={setCurrentPodcastIndex}
                            onVideoSelect={handleVideoSelect}
                            setViewMode={setViewMode}
                            // Playback State & Handlers
                            isPlaying={activePlayback.isPlaying}
                            currentTime={activePlayback.currentTime}
                            duration={activePlayback.duration}
                            playbackRate={activePlayback.playbackRate}
                            setPlaybackRate={activePlayback.setPlaybackRate}
                            togglePlayPause={activePlayback.togglePlayPause}
                            handleSeek={activePlayback.handleSeek}
                            currentItemUrl={currentItemUrl}
                            // Re-add missing props
                            authors={mediaAuthors}
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
        isReceivingData={!!ndkInstance?.pool?.connectedRelays?.().length} // <-- Call function and check length
        relayCount={RELAYS.length}
        onSettingsClick={toggleSettingsModal} // Pass the toggle function
      />
    </div>

    {/* Settings Modal */}
    <SettingsModal
        isOpen={isSettingsOpen}
        onClose={handleCloseSettings}
        ndkInstance={ndkInstance} // <-- Pass singleton
        wallet={wallet} // <<< Pass wallet instance >>>
    />

    </>
  );
}

export default App;

