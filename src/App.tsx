import { useEffect, useState, useCallback } from 'react';
import QRCode from 'react-qr-code'; // Import QRCode
import MediaFeed, { MediaFeedProps, MediaNote } from './components/MediaFeed'; // Import props type if needed
import MessageBoard from './components/MessageBoard'; // Re-enable import
import Podcastr from './components/Podcastr'; // Re-import Podcastr
import VideoList, { VideoNote } from './components/VideoList'; // Import VideoList
import VideoPlayer from './components/VideoPlayer'; // Import VideoPlayer
import RelayStatus from './components/RelayStatus'; // Import the new component
import { nip19 } from 'nostr-tools';
import { MAIN_THREAD_NEVENT_URI, RELAYS } from './constants';
import { useNdk } from 'nostr-hooks'; // Import the main hook
import { NDKEvent, NDKFilter, NDKSubscription } from '@nostr-dev-kit/ndk';

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
  // Initialize NDK
  const { initNdk, ndk } = useNdk();
  const [mediaAuthors, setMediaAuthors] = useState<string[]>([]); // State for media authors
  const [isLoadingAuthors, setIsLoadingAuthors] = useState<boolean>(true); // Loading state for authors
  
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

  // Define handleVideoSelect first
  const handleVideoSelect = useCallback((url: string | null, npub: string | null, index: number) => {
    console.log(`App: Video selected - URL: ${url}, Npub: ${npub}, Index: ${index}`);
    setSelectedVideoUrl(url);
    setSelectedVideoNpub(npub);
    setCurrentVideoIndex(index);
  }, []); // No dependencies needed if it only calls setters

  useEffect(() => {
    console.log("App: Initializing NDK...");
    initNdk({
      explicitRelayUrls: RELAYS,
      // debug: true,
    });
  }, [initNdk]);

  // Effect to Connect NDK and Subscribe to Kind 3 List
  useEffect(() => {
    if (!ndk) return;

    let sub: NDKSubscription | null = null; // Keep track of the subscription
    let foundKind3Event = false; // Flag to track if event was found

    const fetchKind3List = async () => { // Keep async for connect
        console.log("App: Ensuring NDK connection for Kind 3 fetch...");
        try {
            // Connect explicitly before subscribing if not already connected
            // NDK connect() handles multiple calls gracefully
            await ndk.connect();
            console.log("App: NDK Connected. Subscribing to Kind 3 list...");

            const tvPubkeyHex = getHexPubkey(TV_PUBKEY_NPUB);
            if (!tvPubkeyHex) {
                console.error("App: Invalid TV_PUBKEY_NPUB, cannot fetch authors.");
                setIsLoadingAuthors(false);
                return;
            }

            console.log(`App: Subscribing to Kind 3 contact list for ${tvPubkeyHex}...`);
            setIsLoadingAuthors(true); // Set loading before subscribing

            const filter: NDKFilter = { kinds: [3], authors: [tvPubkeyHex], limit: 1 };
            // Use closeOnEose: false to manage loading state accurately with the flag
            sub = ndk.subscribe(filter, { closeOnEose: false });

            sub.on('event', (kind3Event: NDKEvent) => {
                if (foundKind3Event) return; // Process only the first event due to limit: 1 logic

                foundKind3Event = true; // Mark as found
                console.log("App: Found Kind 3 event:", kind3Event.rawEvent());
                const followed = kind3Event.tags
                    .filter(tag => tag[0] === 'p' && tag[1])
                    .map(tag => tag[1]); // These are hex pubkeys
                const authors = Array.from(new Set([tvPubkeyHex, ...followed]));
                console.log(`App: Setting media authors (TV + follows):`, authors);
                setMediaAuthors(authors);
                setIsLoadingAuthors(false); // Stop loading once event found
                sub?.stop(); // Stop subscription after processing the event
            });

            sub.on('eose', () => {
                console.log("App: Kind 3 subscription EOSE received.");
                // If EOSE is received and we haven't found the event yet
                if (!foundKind3Event) {
                    console.warn("App: No Kind 3 event found for TV pubkey after EOSE. Media feed might be empty.");
                    setMediaAuthors([]); // Set to empty if no Kind 3 found
                    setIsLoadingAuthors(false); // Stop loading after EOSE if no event
                    // No need to stop sub here, cleanup will handle it or it stops automatically if relays disconnect
                }
            });

             sub.on('closed', () => {
                console.log("App: Kind 3 subscription closed.");
                // Ensure loading state is false if subscription closes unexpectedly before EOSE/event
                if (isLoadingAuthors && !foundKind3Event) {
                     console.warn("App: Kind 3 subscription closed before event or EOSE. Setting authors empty.");
                     setMediaAuthors([]);
                     setIsLoadingAuthors(false);
                }
            });


        } catch (err) {
            console.error("App: NDK Connection or Kind 3 Subscription Error", err);
            setIsLoadingAuthors(false); // Stop loading on error
        }
    };

    fetchKind3List();

    // Cleanup function
    return () => {
      console.log("App: Cleaning up Kind 3 subscription...");
      sub?.stop(); // Ensure subscription is stopped on unmount or ndk change
    };

  }, [ndk]); // Re-run when NDK instance is available

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

  // --> Use the nevent URI directly for the QR code value <--
  const qrValue = MAIN_THREAD_NEVENT_URI || '';
  if (!qrValue) {
      console.warn("App.tsx: MAIN_THREAD_NEVENT_URI is not set in constants.ts. QR code will be empty.");
  }

  // Placeholder for relay status
  const isReceivingData = false; 

  return (
    <>
    {/* Outermost div: Has padding, border, AND background */}
    {/* Background style will be handled dynamically later for ambient effect */}
    <div className="relative flex flex-col min-h-screen h-screen text-white border-4 border-purple-600 pt-8 bg-black">
      {/* Absolute Positioned Titles (Remain the same) */}
      <h2 className="absolute top-4 right-32 z-20 text-lg font-semibold text-purple-800 px-4 py-1 rounded">
        Mad⚡str.tv
      </h2>
      <h2 className="absolute top-1/2 left-32 -translate-y-1/2 z-30 text-lg font-semibold text-purple-800 px-4 py-1 rounded">
        📺 TV Feed 🎉
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
         ) : selectedVideoUrl && interactiveMode === 'video' ? ( // Only show VideoPlayer if a video is selected AND in video mode
            <VideoPlayer 
              url={selectedVideoUrl} 
              posterNpub={selectedVideoNpub} 
              onEnded={handleNext} // Trigger next video when current ends
            />
         ) : (
            <div className="relative w-full flex-grow min-h-0 bg-black flex items-center justify-center overflow-hidden">
                 {/* ---> Pass handlers and state down to MediaFeed <-- */}
                <MediaFeed 
                    authors={mediaAuthors} 
                    handlePrevious={handlePrevious}
                    handleNext={handleNext}
                    mediaMode={interactiveMode}
                    currentImageIndex={currentImageIndex}
                    imageNotes={imageNotes}
                    onNotesLoaded={handleImageNotesLoaded}
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
            
            {/* ---> ADD Toggle Button Here (Top Center of this section) <--- */}
            <button 
               onClick={toggleInteractiveMode}
               // Position absolute relative to this container, top-center
               className="absolute top-1 left-1/2 transform -translate-x-1/2 z-20 p-1 bg-black bg-opacity-60 rounded 
                          text-purple-400 hover:text-purple-200 focus:text-purple-200 
                          focus:outline-none transition-colors duration-150 text-xs font-semibold uppercase"
               aria-label={interactiveMode === 'podcast' ? 'Show Video List' : 'Show Podcasts'}
               title={interactiveMode === 'podcast' ? 'Show Video List' : 'Show Podcasts'}
            >
                {interactiveMode === 'podcast' ? 'Videos' : 'Podcasts'}
            </button>

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
                            <Podcastr authors={mediaAuthors} /> // TODO: Need to lift audioNotes state?
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
