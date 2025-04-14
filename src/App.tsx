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

// Public key for this TV instance (used for displaying QR code)
const TV_PUBKEY_NPUB = 'npub1a5ve7g6q34lepmrns7c6jcrat93w4cd6lzayy89cvjsfzzwnyc4s6a66d8';

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

  // --- REMOVE Effects that called handle...Loaded --- 
  // Effect to handle and shuffle loaded image notes
  // useEffect(() => { 
  //   handleImageNotesLoaded(imageNotes); // Pass original sorted notes to state hook
  //   console.log(`App: Shuffling ${imageNotes.length} image notes.`);
  //   setShuffledImageNotes(shuffleArray(imageNotes)); // Update shuffled state for UI
  // }, [imageNotes, handleImageNotesLoaded]);

  // Effect to handle loaded podcast notes (no shuffling needed for podcasts)
  // useEffect(() => { 
  //   handlePodcastNotesLoaded(podcastNotes); 
  // }, [podcastNotes, handlePodcastNotesLoaded]);

  // Effect to handle and shuffle loaded video notes
  // useEffect(() => { 
  //   handleVideoNotesLoaded(videoNotes); // Pass original sorted notes to state hook
  //   console.log(`App: Shuffling ${videoNotes.length} video notes.`);
  //   setShuffledVideoNotes(shuffleArray(videoNotes)); // Update shuffled state for UI
  // }, [videoNotes, handleVideoNotesLoaded]);

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
    play, // Keep play/pause if needed by effects
    pause, // Keep play/pause if needed by effects
    isSeeking,      
    setIsSeeking,   
  } = useMediaElementPlayback({
    mediaElementRef: activeMediaRef as React.RefObject<HTMLMediaElement>,
    currentItemUrl: currentItemUrl, 
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

  // --- Keyboard Listener (Updated for new modes) ---
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      console.log(`App: Key event - Key: ${event.key}, Code: ${event.code}, Mode: ${viewMode}`);
      
      // --- Back Key Handling --- 
      if (event.key === 'Escape' || event.key === 'Backspace' || event.key === 'Back') {
        console.log("App: Back/exit button pressed");
        // if (viewMode === 'videoPlayer') { // <<< Correct comparison already done 
        // ...
        // } else {
        // ...
        // }
      }
      
      // --- Space bar toggles play/pause (works for audio or video via hook) --- 
      // ...

    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  // Update dependencies if needed (handlePrevious/Next come from useMediaState)
  }, [viewMode, setViewMode, togglePlayPause]); // Removed handlePrevious/Next

  // --- Effect to Trigger Play on Mode Switch to Video --- 
  useEffect(() => {
      // if (viewMode === 'videoPlayer' && currentItemUrl && !isPlaying) { // <<< Correct comparison done
      // ...
      // }
  }, [viewMode, currentItemUrl, play, isPlaying]); // Keep dependencies for play effect

  // ... return JSX ...

  return (
    <>
    {/* Outermost div: Has padding, border, AND background */}
    {/* Background style will be handled dynamically later for ambient effect */}
    <div className="relative flex flex-col min-h-screen h-screen text-white border-4 border-purple-600 pt-8 bg-black">
      {/* Absolute Positioned Titles (Remain the same) */}
      <h2 className="absolute top-4 right-32 z-20 text-lg font-semibold text-purple-800 px-4 py-1 rounded">
        Mad⚡tr.tv
      </h2>

      {/* --- Bottom Left Area (QR Code Only) --- */}
      <div className="absolute bottom-4 left-4 z-10 flex flex-col items-center">
          {/* Reply QR Code Container */}
          <div className="bg-white p-1 rounded shadow-lg w-16 h-16 md:w-20 md:h-20 lg:w-24 lg:w-24 mb-1">
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

      {/* Relay Status Display (Bottom Left) - May need adjustment if overlapping */}
      {/* --> Keep RelayStatus, adjust positioning if needed <-- */}
      {/* Let's move RelayStatus slightly above the QR code maybe? Or to another corner? */}
      {/* For now, let's keep it but be aware of potential overlap */}
      <RelayStatus isReceivingData={isReceivingData} />

      {/* Inner wrapper: Fills space below padding, NO background, NO border */}
      <div className="relative flex flex-col flex-grow min-h-0 overflow-hidden">

        {/* MediaFeed Area (Top Section) - CONDITIONAL RENDERING */}
         <div className="relative w-full flex-grow min-h-0 bg-black flex items-center justify-center overflow-hidden">
             {isLoadingAuthors ? (
                 <p className="text-gray-400">Loading author list...</p>
             ) : viewMode === 'imagePodcast' ? (
                 <ImageFeed 
                     ref={imageFeedRef}
                     isLoading={isLoadingImages}
                     handlePrevious={handlePrevious}
                     handleNext={handleNext}
                     currentImageIndex={currentImageIndex}
                     imageNotes={shuffledImageNotes}
                 />
             ) : viewMode === 'videoPlayer' ? (
                 <VideoPlayer 
                     videoRef={videoRef}
                     src={currentItemUrl} 
                     isPlaying={isPlaying}
                     togglePlayPause={togglePlayPause}
                 />
             ) : null
             }
         </div>

        {/* ---> Prev/Next Buttons (Show if current view mode has multiple items) <--- */}
        {/* Logic needs to check shuffled notes length now */}
        {(viewMode === 'imagePodcast' && shuffledImageNotes.length > 1) || 
         (viewMode === 'videoPlayer' && shuffledVideoNotes.length > 1) ? (
          <>
            {/* Prev Button */}
            <button 
                onClick={handlePrevious}
                className="absolute left-0 top-1/2 transform -translate-y-1/2 z-10 bg-transparent border-none text-purple-600 hover:text-purple-400 focus:text-purple-400 focus:outline-none transition-colors duration-150 m-0"
                aria-label="Previous Item"
                style={{ transform: 'translateY(-50%) translateY(-120px)' }} // Adjusted upward offset 
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 p-0 m-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 5 L 13 12 L 15 19" />
                </svg>
            </button>
            {/* Next Button */}
            <button 
                onClick={handleNext}
                className="absolute right-0 top-1/2 transform -translate-y-1/2 z-10 bg-transparent border-none text-purple-600 hover:text-purple-400 focus:text-purple-400 focus:outline-none transition-colors duration-150 m-0"
                aria-label="Next Item"
                style={{ transform: 'translateY(-50%) translateY(-120px)' }} // Adjusted upward offset
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 p-0 m-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5 L 11 12 L 9 19" />
                </svg>
            </button>
          </>
        ) : null}

        {/* Split Screen Container: Fixed Height, Flex Row */}
        <div className="relative w-full h-1/3 flex-shrink-0 flex flex-row overflow-hidden mt-1"> 
            
            {/* Message Board Container */}
            <div className="w-2/3 h-full flex-shrink-0 overflow-y-auto bg-gray-900 rounded-lg"> {/* Width 2/3, Scroll */}
                {ndk ? (
                    <MessageBoard 
                      ndk={ndk} 
                      neventToFollow={MAIN_THREAD_NEVENT_URI} 
                      authors={mediaAuthors}
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center"> {/* Centering placeholder */}
                        <p className="text-gray-400">Initializing Nostr connection...</p>
                    </div>
                )}
            </div> {/* End Message Board Container */} 

            {/* Interactive Panel Container (Right 1/3) - Restore MediaPanel */}
            <div className="w-1/3 h-full flex flex-col overflow-hidden ml-1">
                <div className="flex-grow min-h-0 bg-gray-800 rounded-lg p-1">
                    {ndk ? (
                        <MediaPanel
                            audioRef={audioRef}
                            videoRef={videoRef}
                            viewMode={viewMode}
                            authors={mediaAuthors}
                            videoNotes={shuffledVideoNotes}
                            isLoadingPodcastNotes={isLoadingPodcastState}
                            isLoadingVideoNotes={isLoadingVideoState}
                            isPlaying={isPlaying}
                            currentTime={currentTime}
                            duration={duration}
                            playbackRate={playbackRate}
                            currentItemUrl={currentItemUrl}
                            setPlaybackRate={setPlaybackRate}
                            togglePlayPause={togglePlayPause}
                            handleSeek={handleSeek}
                            currentPodcastIndex={currentPodcastIndex}
                            currentVideoIndex={currentVideoIndex}
                            setCurrentPodcastIndex={setCurrentPodcastIndex}
                            onVideoSelect={handleVideoSelect}
                            setViewMode={setViewMode}
                            podcastNotes={podcastNotes}
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400">Initializing...</div>
                    )}
                </div>
            </div>

        </div> {/* End Split Screen Container */} 

      </div> {/* End Inner Wrapper */} 
    </div> {/* End Outermost Div */} 
    </>
  );
}

export default App;

// Helper Regexes (can be defined here or in a utils file)
const imageRegex = /https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp)/i;
const videoRegex = /https?:\/\/\S+\.(?:mp4|mov|webm|m3u8)/i;
const audioRegex = /https?:\/\/\S+\.(?:mp3|m4a|ogg|aac|wav)/i;
