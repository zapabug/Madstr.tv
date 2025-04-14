import { useEffect, useState, useCallback, useRef } from 'react';
import QRCode from 'react-qr-code'; // Import QRCode
import MediaFeed, { MediaFeedProps, MediaNote, MediaFeedRef } from './components/MediaFeed'; // Import props type if needed
import MessageBoard from './components/MessageBoard'; // Re-enable import
import Podcastr from './components/Podcastr'; // Re-import Podcastr
import VideoList, { VideoNote } from './components/VideoList'; // Import VideoList
import VideoPlayer from './components/VideoPlayer'; // Import VideoPlayer
import RelayStatus from './components/RelayStatus'; // Import the new component
import { nip19 } from 'nostr-tools';
import { MAIN_THREAD_NEVENT_URI, RELAYS } from './constants';
import { useMediaAuthors } from './hooks/useMediaAuthors'; // Import the new hook

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
  
  // State for selected video
  const [selectedVideoUrl, setSelectedVideoUrl] = useState<string | null>(null);
  const [selectedVideoNpub, setSelectedVideoNpub] = useState<string | null>(null);

  // State for bottom-right panel toggle
  const [interactiveMode, setInteractiveMode] = useState<'podcast' | 'video'>('podcast');

  // State for notes (now managed centrally)
  const [imageNotes, setImageNotes] = useState<MediaNote[]>([]); 
  const [currentImageIndex, setCurrentImageIndex] = useState<number>(0);
  const [videoNotes, setVideoNotes] = useState<VideoNote[]>([]); 
  const [currentVideoIndex, setCurrentVideoIndex] = useState<number>(0);

  // <<< Add state for Play/Pause button now in App >>>
  const [appIsPlayingRequest, setAppIsPlayingRequest] = useState<boolean>(false); // What App wants the video to do
  const [videoIsPlayingActual, setVideoIsPlayingActual] = useState<boolean>(false); // What VideoPlayer reports

  // <<< Ref for MediaFeed component >>>
  const mediaFeedRef = useRef<MediaFeedRef>(null);

  // Define handleVideoSelect first
  const handleVideoSelect = useCallback((url: string | null, npub: string | null, index: number) => {
    console.log(`App: Video selected - URL: ${url}, Npub: ${npub}, Index: ${index}`);
    setSelectedVideoUrl(url);
    setSelectedVideoNpub(npub);
    setCurrentVideoIndex(index);
  }, []); // No dependencies needed if it only calls setters

  // ---> Callback handlers for loaded notes <---
  const handleImageNotesLoaded = useCallback((notes: MediaNote[]) => {
      console.log(`App: Received ${notes.length} image notes.`);
      setImageNotes(notes);
      // Reset index if it's out of bounds after notes update?
      if (currentImageIndex >= notes.length && notes.length > 0) {
          setCurrentImageIndex(0);
      }
  }, [currentImageIndex]); // Dependency needed for index check

  const handleVideoNotesLoaded = useCallback((notes: VideoNote[]) => {
      console.log(`App: Received ${notes.length} video notes.`);
      setVideoNotes(notes);
      if (currentVideoIndex >= notes.length && notes.length > 0) {
          setCurrentVideoIndex(0);
      }
      if (notes.length > 0 && !selectedVideoUrl) {
          console.log("App: Auto-selecting first video on load.");
          let npub: string | null = null;
          try {
              npub = nip19.npubEncode(notes[0].posterPubkey);
          } catch (e) { console.error("App: Failed to encode npub in handleVideoNotesLoaded", e); }
          // Call handleVideoSelect (now defined above)
          handleVideoSelect(notes[0].url, npub, 0);
      }
  // Remove handleVideoSelect from dependencies
  }, [currentVideoIndex, selectedVideoUrl]);

  // <<< Handler for VideoPlayer reporting its state >>>
  const handleVideoPlayingStateChange = useCallback((isPlaying: boolean) => {
      setVideoIsPlayingActual(isPlaying);
      // Sync request state if actual state changes unexpectedly (e.g., video ends)
      if (!isPlaying && appIsPlayingRequest) {
          setAppIsPlayingRequest(false);
      }
  }, [appIsPlayingRequest]); // Dependency needed for sync logic

  // <<< Handlers for Play/Pause button now in App >>>
  const handleAppPlayPauseClick = useCallback(() => {
      setAppIsPlayingRequest(prev => !prev);
  }, []);

  const handleAppPlayPauseKeyDown = useCallback((event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
          setAppIsPlayingRequest(prev => !prev);
          event.preventDefault();
      }
  }, []);

  // Prev/Next handlers (use centrally managed notes state)
  const handlePrevious = useCallback(() => {
    if (interactiveMode === 'podcast') {
      // Now operates directly on imageNotes state
      const cycleLength = imageNotes.length;
      if (cycleLength === 0) return;
      const prevIndex = (currentImageIndex - 1 + cycleLength) % cycleLength;
      setCurrentImageIndex(prevIndex);
      console.log(`App: Previous Image - Index: ${prevIndex}`);
    } else {
      // Now operates directly on videoNotes state
      const cycleLength = videoNotes.length;
      if (cycleLength === 0) return;
      const prevIndex = (currentVideoIndex - 1 + cycleLength) % cycleLength;
      setCurrentVideoIndex(prevIndex);
      const newSelectedVideo = videoNotes[prevIndex];
      if (newSelectedVideo) {
          setSelectedVideoUrl(newSelectedVideo.url);
          // ---> Encode hex pubkey to npub <---
          let npub: string | null = null;
          try {
              npub = nip19.npubEncode(newSelectedVideo.posterPubkey);
          } catch (e) { console.error("App: Failed to encode npub in handlePrevious", e); }
          setSelectedVideoNpub(npub);
          console.log(`App: Previous Video - Index: ${prevIndex}, URL: ${newSelectedVideo.url}`);
      } else {
          console.warn("App: Previous Video - No video found at index", prevIndex);
      }
    }
  // Add imageNotes/videoNotes to dependencies as handlers now read them
  }, [interactiveMode, currentImageIndex, currentVideoIndex, imageNotes, videoNotes]);

  const handleNext = useCallback(() => {
    if (interactiveMode === 'podcast') {
      const cycleLength = imageNotes.length;
      if (cycleLength === 0) return;
      const nextIndex = (currentImageIndex + 1) % cycleLength;
      setCurrentImageIndex(nextIndex);
      console.log(`App: Next Image - Index: ${nextIndex}`);
    } else {
      const cycleLength = videoNotes.length;
      if (cycleLength === 0) return;
      const nextIndex = (currentVideoIndex + 1) % cycleLength;
      setCurrentVideoIndex(nextIndex);
      const newSelectedVideo = videoNotes[nextIndex];
      if (newSelectedVideo) {
          setSelectedVideoUrl(newSelectedVideo.url);
          // ---> Encode hex pubkey to npub <---
          let npub: string | null = null;
          try {
              npub = nip19.npubEncode(newSelectedVideo.posterPubkey);
          } catch (e) { console.error("App: Failed to encode npub in handleNext", e); }
          setSelectedVideoNpub(npub);
          console.log(`App: Next Video - Index: ${nextIndex}, URL: ${newSelectedVideo.url}`);
      } else {
          console.warn("App: Next Video - No video found at index", nextIndex);
      }
    }
  // Add imageNotes/videoNotes to dependencies
  }, [interactiveMode, currentImageIndex, currentVideoIndex, imageNotes, videoNotes]);

  const toggleInteractiveMode = () => {
      setInteractiveMode(prev => {
        const newMode = prev === 'podcast' ? 'video' : 'podcast';
        console.log("App: Toggling interactiveMode to", newMode);
        if (newMode === 'video' && videoNotes.length > 0) {
            console.log("App: Selecting current/first video on mode toggle.");
            const indexToSelect = currentVideoIndex < videoNotes.length ? currentVideoIndex : 0;
            const videoToSelect = videoNotes[indexToSelect];
            if (videoToSelect) {
                 let npub: string | null = null;
                 try {
                     npub = nip19.npubEncode(videoToSelect.posterPubkey);
                 } catch (e) { console.error("App: Failed to encode npub in toggleInteractiveMode", e); }
                 // Call handleVideoSelect (now defined above)
                 handleVideoSelect(videoToSelect.url, npub, indexToSelect);
            }
        } else if (newMode === 'podcast') {
             // Optionally clear video selection when switching away from video mode?
             // setSelectedVideoUrl(null);
             // setSelectedVideoNpub(null);
        }
        return newMode;
      });
  // Remove handleVideoSelect from dependencies
  // Keep videoNotes, currentVideoIndex if read directly before calling setter?
  // Safer to keep state read inside the callback if logic depends on it.
  // For now, assuming handleVideoSelect is the main dependency needed for the *action*.
  // Let's try removing all dependencies for simplicity, as it only calls setters.
  // }, [videoNotes, currentVideoIndex]); 
  };

  // <<< NEW: Function to focus the toggle button in MediaFeed >>>
  const focusMediaFeedToggle = useCallback(() => {
    console.log("App: focusMediaFeedToggle function called.");
    if (mediaFeedRef.current) {
      console.log("App: Focusing MediaFeed toggle button via ref...");
      mediaFeedRef.current.focusToggleButton();
    }
  }, []);

  // --> Use the nevent URI directly for the QR code value <--
  const qrValue = MAIN_THREAD_NEVENT_URI || '';
  if (!qrValue) {
      console.warn("App.tsx: MAIN_THREAD_NEVENT_URI is not set in constants.ts. QR code will be empty.");
  }

  // Placeholder for relay status
  const isReceivingData = false; 

  // --- Add Keyboard Listener for Mode Toggle ('m' key) ---
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Log all key events for debugging TV remote navigation
      console.log(`App: Key event received - Key: ${event.key}, Code: ${event.code}, KeyCode: ${event.keyCode}`);
      
      // --- Global Actions --- 
      if (event.key === 'm' || event.key === 'M') {
        console.log("App: 'm' key pressed, toggling interactive mode.");
        toggleInteractiveMode();
        event.preventDefault(); 
        return;
      }
      
      // --- Handle Remote Control specific keys ---
      if (event.key === 'Escape' || event.key === 'Backspace' || event.key === 'Back') {
        console.log("App: Remote control back/exit button pressed");
        if (interactiveMode === 'podcast') {
          // Exit podcast mode
          toggleInteractiveMode();
          event.preventDefault();
          return;
        }
        event.preventDefault();
        return;
      }
      
      if (event.key === ' ') { 
        if (interactiveMode === 'video') {
           console.log("App: Space bar pressed, toggling video play/pause.");
           handleAppPlayPauseClick(); 
           event.preventDefault(); 
           return;
        } else {
            // Allow space to bubble up if focus is elsewhere (e.g., Podcastr controls)
            console.log("App: Space in podcast mode, letting event bubble.");
            // Do NOT preventDefault or return here.
        }
      }

      // --- Global Arrow Handling ---
      // Handle Left/Right directly unless propagation was stopped (e.g., seek bar escape)
      /* // <<< START COMMENTING OUT GLOBAL ARROW HANDLERS >>>
      if (event.key === 'ArrowLeft') {
        if (event.cancelBubble) return; // Check if propagation stopped
        console.log("App: Global Left Arrow.");
        handlePrevious();
        event.preventDefault(); // Prevent potential page scroll
      }
      if (event.key === 'ArrowRight') {
        if (event.cancelBubble) return; // Check if propagation stopped
        console.log("App: Global Right Arrow.");
        handleNext();
        event.preventDefault(); // Prevent potential page scroll
      }
      */ // <<< END COMMENTING OUT GLOBAL ARROW HANDLERS >>>
      // Up/Down arrows not handled globally

    };

    console.log("App: Adding keyboard listeners (m, space, arrows - simplified global V2).");
    window.addEventListener('keydown', handleKeyDown);

    // Cleanup function
    return () => {
      console.log("App: Removing keyboard listeners.");
      window.removeEventListener('keydown', handleKeyDown);
    };
    // Dependencies remain the same
  }, [toggleInteractiveMode, handleAppPlayPauseClick, handlePrevious, handleNext]);

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

        {/* MediaFeed Area (Top Section) */}
        {isLoadingAuthors ? (
             <div className="relative w-full flex-grow min-h-0 bg-black flex items-center justify-center overflow-hidden">
                 <p className="text-gray-400">Loading author list...</p>
             </div>
         ) : selectedVideoUrl && interactiveMode === 'video' ? ( 
            <VideoPlayer 
              url={selectedVideoUrl} 
              posterNpub={selectedVideoNpub} 
              onEnded={handleNext} 
              interactiveMode={interactiveMode}
              toggleInteractiveMode={toggleInteractiveMode}
              appIsPlayingRequest={appIsPlayingRequest}
              onVideoPlayingStateChange={handleVideoPlayingStateChange}
            />
         ) : (
            <div className="relative w-full flex-grow min-h-0 bg-black flex items-center justify-center overflow-hidden">
                 {/* ---> Ensure toggle props ARE passed to MediaFeed <-- */}
                <MediaFeed 
                    ref={mediaFeedRef}
                    authors={mediaAuthors} 
                    handlePrevious={handlePrevious}
                    handleNext={handleNext}
                    mediaMode={interactiveMode}
                    currentImageIndex={currentImageIndex}
                    imageNotes={imageNotes}
                    onNotesLoaded={handleImageNotesLoaded}
                    interactiveMode={interactiveMode}
                    toggleInteractiveMode={toggleInteractiveMode}
                />
            </div>
         )}

        {/* ---> Add Prev/Next Buttons Here (Render Conditionally) <--- */}
        {((interactiveMode === 'podcast' && imageNotes.length > 1) || 
          (interactiveMode === 'video' && videoNotes.length > 1)) && (
          <>
            {/* Prev Button - Adjust upward offset */}
            <button 
                onClick={handlePrevious}
                className="absolute left-0 top-1/2 transform -translate-y-1/2 z-10 bg-transparent border-none text-purple-600 hover:text-purple-400 focus:text-purple-400 focus:outline-none transition-colors duration-150 m-0"
                aria-label="Previous Item"
                style={{ transform: 'translateY(-50%) translateY(-120px)' }} 
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 p-0 m-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 5 L 13 12 L 15 19" />
                </svg>
            </button>
            {/* Next Button - Adjust upward offset */}
            <button 
                onClick={handleNext}
                className="absolute right-0 top-1/2 transform -translate-y-1/2 z-10 bg-transparent border-none text-purple-600 hover:text-purple-400 focus:text-purple-400 focus:outline-none transition-colors duration-150 m-0"
                aria-label="Next Item"
                style={{ transform: 'translateY(-50%) translateY(-120px)' }} 
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 p-0 m-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5 L 11 12 L 9 19" />
                </svg>
            </button>
          </>
        )}

        {/* Split Screen Container: Fixed Height, Flex Row */}
        <div className="relative w-full h-1/3 flex-shrink-0 flex flex-row overflow-hidden mt-1"> {/* Added small margin-top */}
            
            {/* ---> Play/Pause Button (Keep as is) <--- */}
             {interactiveMode === 'video' && (
                  <button 
                       // Conditionally apply background based on playing state
                       className={`absolute top-1 left-1/2 transform -translate-x-1/2 z-20 
                                flex-shrink-0 p-2 rounded-md text-white 
                                focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-1 focus:ring-offset-black 
                                transition-colors duration-150 
                                ${!videoIsPlayingActual 
                                  ? 'bg-purple-600 hover:bg-purple-500' 
                                  : 'bg-transparent hover:bg-white/10' // Transparent background when playing
                                }`}
                       onClick={handleAppPlayPauseClick}
                       onKeyDown={handleAppPlayPauseKeyDown}
                       aria-label={videoIsPlayingActual ? "Pause Video" : "Play Video"}
                       title={videoIsPlayingActual ? "Pause Video" : "Play Video"}
                  >
                      {videoIsPlayingActual ? (
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
                          </svg>
                      ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
                          </svg>
                      )}
                  </button>
             )}

            {/* Message Board Container (Left Side - 2/3 width) */}
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

            {/* Interactive Panel Container (Right 1/3) */}
            <div className="w-1/3 h-full flex flex-col overflow-hidden ml-1">
                <div className="flex-grow min-h-0 bg-gray-800 rounded-lg p-1">
                    {ndk ? (
                        interactiveMode === 'podcast' ? (
                            <Podcastr 
                                authors={mediaAuthors} 
                                handleLeft={handlePrevious}
                                handleRight={handleNext}
                                onFocusRightEdge={focusMediaFeedToggle}
                                onFocusBottomEdge={focusMediaFeedToggle}
                            /> 
                        ) : (
                            <VideoList 
                                authors={mediaAuthors} 
                                onVideoSelect={handleVideoSelect} 
                                currentVideoIndex={currentVideoIndex}
                                videoNotes={videoNotes}
                                onNotesLoaded={handleVideoNotesLoaded}
                            />
                        )
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
