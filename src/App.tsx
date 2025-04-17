import { useEffect, useCallback, useRef, useState } from 'react';
import QRCode from 'react-qr-code';
import ImageFeed, { ImageFeedRef } from './components/ImageFeed';
import MessageBoard from './components/MessageBoard';
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
import { NostrNote } from './types/nostr';
import { shuffleArray } from './utils/shuffleArray';
import { motion, AnimatePresence } from 'framer-motion';
import SettingsModal from './components/SettingsModal';
import { useAuth } from './hooks/useAuth';

// Fullscreen Timeouts
const INTERACTION_TIMEOUT = 30000; // 30 seconds
const MESSAGE_TIMEOUT = 120000; // 2 minutes
const CHECK_INTERVAL = 5000; // Check every 5 seconds

// --- Constants ---
const IMAGE_CAROUSEL_INTERVAL = 45000; // 45 seconds

function App() {
  // Use the new hook to get NDK instance, authors, and loading state
  const { ndk, mediaAuthors, isLoadingAuthors } = useMediaAuthors();

  // --- Auth Hook --- 
  const auth = useAuth(ndk); // Pass NDK instance
  const { followedTags } = auth; // Get followedTags from auth state

  // State for fetch parameters
  const [imageFetchLimit] = useState<number>(200);
  const [videoFetchLimit] = useState<number>(200);
  const [imageFetchUntil, setImageFetchUntil] = useState<number | undefined>(undefined);
  const [videoFetchUntil, setVideoFetchUntil] = useState<number | undefined>(undefined);

  // Fetch notes using dynamic parameters
  const { notes: podcastNotes, isLoading: isLoadingPodcastNotes } = useMediaNotes({ 
    authors: mediaAuthors, 
    mediaType: 'podcast', 
    ndk: ndk || null, 
    limit: 200 // Keep podcast limit fixed for now
  });
  const { notes: videoNotes, isLoading: isLoadingVideoNotes } = useMediaNotes({ 
    authors: mediaAuthors, 
    mediaType: 'video', 
    ndk: ndk || null, 
    limit: videoFetchLimit, 
    until: videoFetchUntil,
    followedTags: followedTags // Pass followedTags
  });
  const { notes: imageNotes, isLoading: isLoadingImages } = useMediaNotes({ 
    authors: mediaAuthors, 
    mediaType: 'image', 
    ndk: ndk || null, 
    limit: imageFetchLimit, 
    until: imageFetchUntil,
    followedTags: followedTags // Pass followedTags
  });
  
  // State for shuffled notes for display
  const [shuffledImageNotes, setShuffledImageNotes] = useState<NostrNote[]>([]);
  const [shuffledVideoNotes, setShuffledVideoNotes] = useState<NostrNote[]>([]);

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
    currentItemUrl, 
    handleVideoSelect, 
    handlePrevious,
    handleNext, 
    setViewMode, 
    setCurrentPodcastIndex,
  } = useMediaState({ 
      initialImageNotes: shuffledImageNotes, 
      initialPodcastNotes: podcastNotes,
      initialVideoNotes: shuffledVideoNotes,
      fetchOlderImages: fetchOlderImages, 
      fetchOlderVideos: fetchOlderVideos,
      shuffledImageNotesLength: shuffledImageNotes.length,
      shuffledVideoNotesLength: shuffledVideoNotes.length,
  });

  // Effects for shuffling notes
  useEffect(() => {
    setShuffledImageNotes(shuffleArray([...imageNotes]));
  }, [imageNotes]);

  useEffect(() => {
    // --- Deduplicate video notes by URL, keeping the newest --- 
    const uniqueVideoNotesMap = new Map<string, NostrNote>();
    for (const note of videoNotes) {
        if (note.url && !uniqueVideoNotesMap.has(note.url)) {
            uniqueVideoNotesMap.set(note.url, note);
        }
    }
    const uniqueVideoNotes = Array.from(uniqueVideoNotesMap.values());
    console.log(`App: Deduplicated ${videoNotes.length} video notes to ${uniqueVideoNotes.length} unique URLs.`);

    // --- Shuffle the unique video notes --- 
    setShuffledVideoNotes(shuffleArray(uniqueVideoNotes)); 

  }, [videoNotes]);

  // Fullscreen hook
  const { isFullScreen, signalInteraction, signalMessage } = useFullscreen({
    interactionTimeout: INTERACTION_TIMEOUT,
    messageTimeout: MESSAGE_TIMEOUT,
    checkInterval: CHECK_INTERVAL,
  });

  // Callback for MessageBoard
  const handleNewMessage = useCallback(() => {
      signalMessage(); 
  }, [signalMessage]);

  // Refs for media elements
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Determine active media ref and initial time based on viewMode
  const activeMediaRef = viewMode === 'videoPlayer' ? videoRef : audioRef;
  const playbackInitialTime = viewMode === 'imagePodcast' ? initialPodcastTime : 0;

  // Media Playback Hook
  const {
    isPlaying,
    currentTime,
    duration,
    playbackRate,
    setPlaybackRate,
    togglePlayPause,
    handleSeek,
    isMuted,
    autoplayFailed,
  } = useMediaElementPlayback({
    mediaElementRef: activeMediaRef as React.RefObject<HTMLMediaElement>,
    currentItemUrl: currentItemUrl, 
    viewMode: viewMode,
    onEnded: handleNext, 
    initialTime: playbackInitialTime, 
  });

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
    onTogglePlayPause: togglePlayPause, 
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
      videoNotes: shuffledVideoNotes,
  });

  // Effect to determine and set the preload URL
  useEffect(() => {
    let urlToPreload: string | null = null;

    if (shuffledVideoNotes.length > 0) {
      if (viewMode === 'videoPlayer') {
        // Preload the NEXT video if in video mode and more than one video exists
        if (shuffledVideoNotes.length > 1) {
          const nextIndex = (currentVideoIndex + 1) % shuffledVideoNotes.length;
          const nextNote = shuffledVideoNotes[nextIndex];
          // Only preload if the next URL is valid and different from the current one
          if (nextNote?.url && nextNote.url !== currentItemUrl) {
            urlToPreload = nextNote.url;
            console.log(`App: Preloading NEXT video (index ${nextIndex}): ${urlToPreload}`);
          }
        }
      } else {
        // Preload the FIRST video if NOT in video mode
        const firstNote = shuffledVideoNotes[0];
        if (firstNote?.url) {
          urlToPreload = firstNote.url;
          // Avoid logging if it's the same as the current item in podcast mode (can happen)
          if(viewMode !== 'imagePodcast' || urlToPreload !== currentItemUrl) {
             console.log(`App: Preloading FIRST video (index 0) while in ${viewMode} mode: ${urlToPreload}`);
          }
        }
      }
    }

    // Set the preload URL state only if it has changed
    if (preloadVideoUrl !== urlToPreload) {
       setPreloadVideoUrl(urlToPreload);
    }

    // Dependencies: Need to react to mode changes, video list changes, current index changes (for 'next'),
    // and the currentItemUrl (to avoid preloading the same item).
    // Also include preloadVideoUrl in deps to prevent potential redundant sets if the calculated urlToPreload hasn't changed.
  }, [viewMode, currentVideoIndex, shuffledVideoNotes, currentItemUrl, preloadVideoUrl]);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const handleCloseSettings = useCallback(() => {
    setIsSettingsOpen(false);
  }, []);

  // Callback to toggle the settings modal state
  const toggleSettingsModal = useCallback(() => {
    setIsSettingsOpen(prev => !prev);
    signalInteraction(); // Also signal interaction when settings are toggled
  }, [signalInteraction]);

  return (
    <>
    {/* Outermost div */}
    <div className="relative flex flex-col min-h-screen h-screen text-white border-2 border-purple-900 bg-gradient-radial from-gray-900 via-black to-black">

      {/* Invisible Audio Element */}
      <audio
        ref={audioRef}
        src={viewMode === 'imagePodcast' && currentItemUrl ? currentItemUrl : undefined}
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
                             autoplayFailed={autoplayFailed}
                             isMuted={isMuted}
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
            (viewMode === 'videoPlayer' && shuffledVideoNotes.length > 1)
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
                    {/* Message Board Container */}
                    <div className="w-2/3 h-full flex-shrink-0 overflow-y-auto bg-gray-900/80 rounded-lg backdrop-blur-sm p-2">
                        {ndk ? (
                            <MessageBoard
                              ndk={ndk}
                              neventToFollow={MAIN_THREAD_NEVENT_URI}
                              authors={mediaAuthors}
                              onNewMessage={handleNewMessage}
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center">
                                <p className="text-gray-400">Initializing Nostr connection...</p>
                            </div>
                        )}
                    </div>

                    {/* Interactive Panel Container (Right 1/3) */}
                    <div className="w-1/3 h-full flex flex-col">
                        <MediaPanel
                            viewMode={viewMode}
                            audioRef={audioRef}
                            videoRef={videoRef}
                            podcastNotes={podcastNotes}
                            videoNotes={shuffledVideoNotes}
                            isLoadingPodcastNotes={isLoadingPodcastNotes}
                            isLoadingVideoNotes={isLoadingVideoNotes}
                            currentPodcastIndex={currentPodcastIndex}
                            currentVideoIndex={currentVideoIndex}
                            setCurrentPodcastIndex={setCurrentPodcastIndex}
                            onVideoSelect={handleVideoSelect}
                            setViewMode={setViewMode}
                            // Playback State & Handlers
                            isPlaying={isPlaying}
                            currentTime={currentTime}
                            duration={duration}
                            playbackRate={playbackRate}
                            setPlaybackRate={setPlaybackRate}
                            togglePlayPause={togglePlayPause}
                            handleSeek={handleSeek}
                            currentItemUrl={currentItemUrl}
                            authors={mediaAuthors}
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
        isReceivingData={!!ndk} // Use !!ndk directly
        relayCount={RELAYS.length}
        onSettingsClick={toggleSettingsModal} // Pass the toggle function
      />
    </div>

    {/* Preload Link */}
    {preloadVideoUrl && (
        <link rel="preload" href={preloadVideoUrl} as="video" /> 
    )}

    {/* Settings Modal */}
    <SettingsModal
        isOpen={isSettingsOpen}
        onClose={handleCloseSettings}
        ndkInstance={ndk} // Pass ndk instance to modal
    />

    </>
  );
}

export default App;

