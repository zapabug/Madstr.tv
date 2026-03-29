import React, { useEffect, useCallback, useRef, useState } from 'react';
import ImageFeed, { ImageFeedRef } from './components/ImageFeed';
import InfoPanel from './components/InfoPanel';
import MediaPanel from './components/MediaPanel';
import RelayStatus from './components/RelayStatus';
import VideoPlayer from './components/VideoPlayer';
import { } from './constants';
import { useMediaAuthors } from './hooks/useMediaAuthors';
import { useMediaState } from './hooks/useMediaState';
import { useMediaElementPlayback } from './hooks/useMediaElementPlayback';
import { useMediaNotes } from './hooks/useMediaNotes';
import { useFullscreen } from './hooks/useFullscreen';
import { useKeyboardControls } from './hooks/useKeyboardControls';
import { useImageCarousel } from './hooks/useImageCarousel';
import { useCurrentAuthor } from './hooks/useCurrentAuthor';
import { useNDKInit } from './hooks/useNDKInit';
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
  // --- NDK Initialization (Using Hook) ---
  const { isConnecting: isNdkConnecting, connectionError: ndkConnectionError, ndkInstance } = useNDKInit();

  // --- Auth Hook (must be before useMediaAuthors) --- 
  const auth = useAuth(ndkInstance);
  const { followedTags, videoTags, musicTags, fetchImagesByTagEnabled, fetchVideosByTagEnabled, fetchMusicByTagEnabled, keywordSearch, currentUserNpub, mutedPubkeys } = auth;

  // Use the authors hook - uses logged-in user's follows if available, otherwise TV's follows
  const { mediaAuthors, isLoadingAuthors } = useMediaAuthors({ ndk: ndkInstance, currentUserNpub });

  // State for fetch parameters
  const [imageFetchLimit] = useState<number>(500);
  const [videoFetchLimit] = useState<number>(30);
  const [imageFetchUntil, setImageFetchUntil] = useState<number | undefined>(undefined);
  const [videoFetchUntil, setVideoFetchUntil] = useState<number | undefined>(undefined);
  const [notesRefreshKey, setNotesRefreshKey] = useState<number>(0);

  // Fetch notes using dynamic parameters
  const { notes: audioNotes, isLoading: isLoadingAudioNotes, markAsSeen: markAudioSeen } = useMediaNotes({ 
    authors: mediaAuthors, 
    mediaType: 'audio', 
    ndk: ndkInstance, 
    limit: 25,
    followedTags: fetchMusicByTagEnabled ? musicTags : undefined,
    refreshKey: notesRefreshKey,
    mutedPubkeys,
  });
  const { notes: videoNotes, isLoading: isLoadingVideoNotes, markAsSeen: markVideoSeen } = useMediaNotes({ 
    authors: mediaAuthors, 
    mediaType: 'video', 
    ndk: ndkInstance, 
    limit: videoFetchLimit,
    until: videoFetchUntil,
    followedTags: fetchVideosByTagEnabled ? videoTags : undefined,
    refreshKey: notesRefreshKey,
    mutedPubkeys,
  });
  const { notes: imageNotes, isLoading: isLoadingImages } = useMediaNotes({ 
    authors: mediaAuthors, 
    mediaType: 'image', 
    ndk: ndkInstance, 
    limit: imageFetchLimit,
    until: imageFetchUntil,
    followedTags: fetchImagesByTagEnabled ? followedTags : undefined,
    refreshKey: notesRefreshKey,
    mutedPubkeys,
  });
  
  // State for shuffled notes for display
  const [shuffledImageNotes, setShuffledImageNotes] = useState<NostrNote[]>([]);
  const [uniqueVideoNotes, setUniqueVideoNotes] = useState<NostrNote[]>([]);

  // State for audio saved position
  const [initialAudioTime] = useState<number>(0);

  // State for preload URL
  const [preloadVideoUrl, setPreloadVideoUrl] = useState<string | null>(null);

  // State for video author filter
  const [selectedVideoAuthor] = useState<string | null>(null);

  // State for music filter
  const [showMusicOnly, setShowMusicOnly] = useState<boolean>(false);

  // Filtered video notes by selected author (computed from uniqueVideoNotes)
  const filteredVideoNotes = selectedVideoAuthor
    ? uniqueVideoNotes.filter(note => note.posterPubkey === selectedVideoAuthor)
    : uniqueVideoNotes;

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

  // Keyword filter for follows content
  const filterByKeyword = (notes: NostrNote[], keyword: string): NostrNote[] => {
    if (!keyword || keyword.trim() === '') return notes;
    const lowerKeyword = keyword.toLowerCase();
    return notes.filter(note => 
      note.content?.toLowerCase().includes(lowerKeyword)
    );
  };

  // Apply keyword filter to audio notes
  const keywordFilteredAudioNotes = filterByKeyword(audioNotes, keywordSearch);

  // Media state hook
  const {
    viewMode, 
    currentImageIndex,
    currentAudioIndex,
    currentVideoIndex,
    handleVideoSelect, 
    handlePrevious,
    handleNext, 
    setViewMode, 
    setCurrentAudioIndex,
    audioNotes: stateAudioNotes, 
    videoNotes: stateVideoNotes,
    currentItemUrl,
  } = useMediaState({ 
      initialImageNotes: keywordSearch ? filterByKeyword(shuffledImageNotes, keywordSearch) : shuffledImageNotes, 
      initialAudioNotes: keywordFilteredAudioNotes,
      initialVideoNotes: keywordSearch ? filterByKeyword(filteredVideoNotes, keywordSearch) : filteredVideoNotes,
      fetchOlderImages: fetchOlderImages, 
      fetchOlderVideos: fetchOlderVideos,
      shuffledImageNotesLength: keywordSearch ? filterByKeyword(shuffledImageNotes, keywordSearch).length : shuffledImageNotes.length,
      shuffledVideoNotesLength: keywordSearch ? filterByKeyword(filteredVideoNotes, keywordSearch).length : filteredVideoNotes.length,
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

  // Refresh notes when mute list changes
  useEffect(() => {
    if (mutedPubkeys && mutedPubkeys.length > 0) {
      console.log('App.tsx: Mute list updated, refreshing feeds:', mutedPubkeys.length, 'muted');
      setNotesRefreshKey(k => k + 1);
    }
  }, [mutedPubkeys]);

  // Fullscreen hook
  const { isFullScreen, isBrowserFullscreen, signalInteraction, toggleBrowserFullscreen } = useFullscreen({
    interactionTimeout: INTERACTION_TIMEOUT,
    messageTimeout: MESSAGE_TIMEOUT,
    checkInterval: CHECK_INTERVAL,
  });

  // Refs for media elements
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // --- Determine URLs and Active States for Playback Hooks ---
  const isAudioMode = viewMode === 'imagePodcast';
  const isVideoMode = viewMode === 'videoPlayer';

  // --- Instantiate Playback Hooks (One for each element) ---
  const audioPlayback = useMediaElementPlayback({
    mediaElementRef: audioRef as React.RefObject<HTMLMediaElement>,
    currentItemUrl: isAudioMode ? currentItemUrl : null,
    isActiveMode: isAudioMode,
    elementType: 'audio',
    onEnded: isAudioMode ? handleNext : undefined, 
    initialTime: initialAudioTime, 
    autoplayEnabled: true,
    next: true,
  });

  const videoPlayback = useMediaElementPlayback({
    mediaElementRef: videoRef as React.RefObject<HTMLMediaElement>,
    currentItemUrl: isVideoMode ? currentItemUrl : null,
    isActiveMode: isVideoMode,
    elementType: 'video',
    onEnded: isVideoMode ? handleNext : undefined, 
    initialTime: 0, 
    autoplayEnabled: true, // Enable autoplay for back-to-back video playback
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

  // Current video/image note info for QR codes
  const currentVideoNote = viewMode === 'videoPlayer' && uniqueVideoNotes.length > 0 && currentVideoIndex < uniqueVideoNotes.length
    ? uniqueVideoNotes[currentVideoIndex]
    : null;
  const currentImageNote = viewMode === 'imagePodcast' && shuffledImageNotes.length > 0 && currentImageIndex < shuffledImageNotes.length
    ? shuffledImageNotes[currentImageIndex]
    : null;

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

  // --- Effect to mark notes as seen on playback ---
  useEffect(() => {
    if (viewMode === 'videoPlayer' && videoNotes.length > 0 && currentVideoIndex < videoNotes.length) {
      const currentNote = videoNotes[currentVideoIndex];
      if (currentNote && markVideoSeen) {
        markVideoSeen(currentNote.id);
      }
    } else if (viewMode === 'imagePodcast' && audioNotes.length > 0 && currentAudioIndex < audioNotes.length) {
      const currentNote = audioNotes[currentAudioIndex];
      if (currentNote && markAudioSeen) {
        markAudioSeen(currentNote.id);
      }
    }
  }, [viewMode, currentVideoIndex, currentAudioIndex, videoNotes, audioNotes, markVideoSeen, markAudioSeen]);

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
  const isLoading = isNdkConnecting || isLoadingAuthors || isLoadingAudioNotes || isLoadingVideoNotes || isLoadingImages;

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

      {/* Inner wrapper */}
      <div className="relative flex flex-col flex-grow min-h-0 overflow-hidden">

        {/* MediaFeed Area (Top Section) */}
         <div className="relative w-full flex-grow min-h-0 bg-black flex items-center justify-center overflow-hidden">
              <AnimatePresence mode='wait'>
                 {isLoading ? (
                     <motion.div
                         key="loading-nostr-data"
                         initial={{ opacity: 0 }}
                         animate={{ opacity: 1 }}
                         exit={{ opacity: 0 }}
                         transition={{ duration: 0.3 }}
                         className="text-gray-400"
                      >
                         Loading Nostr Data...
                     </motion.div>
                 ) : isLoadingAuthors ? (
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
                              currentImageIndex={currentImageIndex}
                              imageNotes={shuffledImageNotes}
                              ndkInstance={ndkInstance}
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
                               isMuted={videoPlayback.isMuted}
                               noteId={currentVideoNote?.id || null}
                               posterPubkey={currentVideoNote?.posterPubkey || null}
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

               {/* Fullscreen Toggle Button (Hide on Media Fullscreen) */}
               <AnimatePresence>
                 {!isFullScreen && (
                   <motion.button
                       key="fullscreen-button"
                       initial={{ opacity: 0 }}
                       animate={{ opacity: 1 }}
                       exit={{ opacity: 0 }}
                       transition={{ duration: 0.3 }}
                       onClick={toggleBrowserFullscreen}
                       tabIndex={0}
                       className="absolute top-2 right-2 z-20 p-2 rounded-md
                                  bg-black/50 text-purple-400
                                  hover:text-purple-200 hover:bg-black/70
                                  focus:outline-none focus:text-purple-300
                                  focus:ring-2 focus:ring-purple-500/50
                                  transition-all duration-150"
                       aria-label="Fullscreen"
                       title="Fullscreen"
                   >
                       {isBrowserFullscreen ? (
                         <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                           <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
                         </svg>
                       ) : (
                         <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                           <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                         </svg>
                       )}
                   </motion.button>
                 )}
               </AnimatePresence>

               {/* Fullscreen Toggle Button (Hide on Fullscreen) */}
               <AnimatePresence>
                 {!isFullScreen && (
                   <motion.button
                       key="fullscreen-button"
                       initial={{ opacity: 0 }}
                       animate={{ opacity: 1 }}
                       exit={{ opacity: 0 }}
                       transition={{ duration: 0.3 }}
                       onClick={toggleBrowserFullscreen}
                       tabIndex={0}
                       className="absolute top-2 right-2 z-20 p-2 rounded-md
                                  bg-black/50 text-purple-400
                                  hover:text-purple-200 hover:bg-black/70
                                  focus:outline-none focus:text-purple-300
                                  focus:ring-2 focus:ring-purple-500/50
                                  transition-all duration-150"
                       aria-label={isBrowserFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                       title={isBrowserFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                   >
                       {isBrowserFullscreen ? (
                         <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                           <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
                         </svg>
                       ) : (
                         <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                           <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                         </svg>
                       )}
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
                     {/* Left Side: Info Panel */}
                     <div className="w-2/3 h-full pr-1 flex flex-col overflow-hidden"> 
                         <InfoPanel
                             note={viewMode === 'videoPlayer' ? currentVideoNote : currentImageNote}
                             viewMode={viewMode}
                             isLoggedIn={auth.isLoggedIn}
                             profileName={currentAuthorNpub ? currentAuthorNpub : 'Unknown'}
                         />
                     </div>
                    {/* Right Side: Media Panel - Adjust width */}
                    <div className="w-1/3 h-full pl-1 flex flex-col"> 
                        <MediaPanel
                            viewMode={viewMode}
                            audioNotes={stateAudioNotes}
                            videoNotes={stateVideoNotes}
                            isLoadingAudioNotes={isLoadingAudioNotes}
                            isLoadingVideoNotes={isLoadingVideoNotes}
                            currentAudioIndex={currentAudioIndex}
                            currentVideoIndex={currentVideoIndex}
                            setCurrentAudioIndex={setCurrentAudioIndex}
                            onVideoSelect={handleVideoSelect}
                            setViewMode={setViewMode}
                            isPlaying={activePlayback.isPlaying}
                            currentTime={activePlayback.currentTime}
                            duration={activePlayback.duration}
                            playbackRate={activePlayback.playbackRate}
                            setPlaybackRate={activePlayback.setPlaybackRate}
                            togglePlayPause={activePlayback.togglePlayPause}
                            handleSeek={activePlayback.handleSeek}
                            showMusicOnly={showMusicOnly}
                            setShowMusicOnly={setShowMusicOnly}
                            ndkInstance={ndkInstance}
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
        relayCount={ndkInstance?.pool?.connectedRelays?.().length || 0}
        onSettingsClick={toggleSettingsModal} // Pass the toggle function
      />
    </div>

    {/* Settings Modal */}
    <SettingsModal
        isOpen={isSettingsOpen}
        onClose={handleCloseSettings}
        ndkInstance={ndkInstance}
        onCloseAndRefresh={() => setNotesRefreshKey(k => k + 1)}
    />

    </>
  );
}

export default App;

