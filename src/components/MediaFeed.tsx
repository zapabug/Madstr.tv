import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'react-qr-code';
import { useNdk } from 'nostr-hooks';
import { NDKEvent, NDKFilter, NDKSubscription, NDKKind } from '@nostr-dev-kit/ndk'; // Removed nip19 import from here
import { nip19 } from 'nostr-tools'; // Import nip19 from nostr-tools

// Re-define MediaNote interface locally or import from a types file
interface MediaNote {
  id: string; // Unique ID: eventId-urlIndex
  eventId: string; // Original event ID
  type: 'image' | 'video';
  url: string;
  posterNpub: string;
  createdAt: number;
}

// --- Re-integrate Helper Logic from old useMediaNotes --- 
// Regex to find image/video/podcast URLs in note content
const mediaUrlRegex = /https?:\/\S+\.(?:png|jpg|jpeg|gif|webp|mp4|mov|webm)/gi;

// Helper to determine media type from URL
function getMediaType(url: string): 'image' | 'video' | null {
  const extension = url.split('.').pop()?.toLowerCase();
  if (!extension) return null;
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(extension)) {
    return 'image';
  }
  if (['mp4', 'mov', 'webm'].includes(extension)) {
    return 'video';
  }
  return null;
}

// IndexedDB setup for caching media metadata
const DB_NAME = 'MediaFeedCache';
const DB_VERSION = 1;
const STORE_NAME = 'mediaNotes';

async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = (event) => reject((event.target as IDBOpenDBRequest).error);
    request.onsuccess = (event) => resolve((event.target as IDBOpenDBRequest).result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      db.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
  });
}

async function saveToCache(notes: MediaNote[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    notes.forEach(note => store.put(note));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

async function getFromCache(): Promise<MediaNote[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => {
      const notes = request.result;
      // Sort by createdAt descending (newest first)
      notes.sort((a: MediaNote, b: MediaNote) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
      // Limit to the most recent 100 items
      if (notes.length > 100) {
        const excessIds = notes.slice(100).map((n: MediaNote) => n.id);
        deleteExcessFromCache(excessIds);
        resolve(notes.slice(0, 100));
      } else {
        resolve(notes);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

async function deleteExcessFromCache(ids: string[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    ids.forEach(id => store.delete(id));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

// Helper function to process events into MediaNote array
const processEventsIntoMediaNotes = (events: NDKEvent[], notesByIdMap: Map<string, MediaNote>): MediaNote[] => {
    const newNotes: MediaNote[] = [];
    events.forEach(event => {
        const content = event.content;
        const matchedUrls = content.match(mediaUrlRegex);

        if (matchedUrls && matchedUrls.length > 0) {
            let posterNpub: string | null = null;
            try {
                posterNpub = nip19.npubEncode(event.pubkey);
            } catch (e) {
                console.error(`[MediaFeed:processEvents] Failed to encode npub for ${event.pubkey}`, e);
                return; // continue to next event in forEach
            }

            matchedUrls.forEach((url, index) => {
                const mediaType = getMediaType(url);
                // Only process if it's an image
                if (mediaType === 'image') { 
                    const mediaItemId = `${event.id}-${index}`;
                    if (!notesByIdMap.has(mediaItemId)) {
                        const newNote: MediaNote = {
                            id: mediaItemId,
                            eventId: event.id,
                            type: mediaType,
                            url: url,
                            posterNpub: posterNpub!,
                            createdAt: event.created_at ?? Math.floor(Date.now() / 1000), // Use NDKEvent's created_at
                        };
                        notesByIdMap.set(mediaItemId, newNote); // Update the map directly
                        newNotes.push(newNote);
                    }
                }
            });
        }
    });
    newNotes.sort((a, b) => b.createdAt - a.createdAt); // Use MediaNote's createdAt for sorting
    if (newNotes.length > 0) {
      saveToCache(newNotes).catch(err => console.error('MediaFeed: Failed to save to cache:', err));
    }
    return newNotes;
};
// --- End Re-integrated Helper Logic ---


// Update props interface
interface MediaFeedProps {
  authors: string[]; // Expect list of hex pubkeys
}

const MAX_SLIDES = 30; // Define max slides to display

const MediaFeed: React.FC<MediaFeedProps> = ({ authors }) => {
  const { ndk } = useNdk(); // Get NDK instance
  const [mediaNotes, setMediaNotes] = useState<MediaNote[]>([]); // Local state for notes
  const notesById = useRef<Map<string, MediaNote>>(new Map()); // Track processed media IDs
  const [currentItemIndex, setCurrentItemIndex] = useState(0);
  const [isCacheLoaded, setIsCacheLoaded] = useState(false);
  
  // State for player controls
  const [isPlaying, setIsPlaying] = useState(true); // Assume autoplay initially
  const [isMuted, setIsMuted] = useState(true); // Start muted for autoplay policy
  const videoRef = useRef<HTMLVideoElement>(null); // Ref for video element

  // Load from cache on component mount
  useEffect(() => {
    getFromCache()
      .then(cachedNotes => {
        console.log(`MediaFeed: Loaded ${cachedNotes.length} items from cache.`);
        setMediaNotes(cachedNotes);
        notesById.current = new Map(cachedNotes.map(note => [note.id, note]));
        setIsCacheLoaded(true);
        if (cachedNotes.length > 0 && currentItemIndex >= cachedNotes.length) {
          setCurrentItemIndex(0);
        }
      })
      .catch(err => {
        console.error('MediaFeed: Failed to load from cache:', err);
        setIsCacheLoaded(true);
      });
  }, []); // Run once on mount

  // --- Subscription Effect --- 
  useEffect(() => {
    // Don't subscribe if NDK is not ready or authors list is empty or cache not loaded
    if (!ndk || authors.length === 0 || !isCacheLoaded) {
        // Clear notes if authors become empty
        if (authors.length === 0) {
            setMediaNotes([]);
            notesById.current.clear();
            setCurrentItemIndex(0); // Reset index
        }
        return;
    }

    console.log(`MediaFeed: Authors updated, creating subscription for ${authors.length} authors...`);

    // Do not clear state if we have cached data
    // setMediaNotes([]);
    // notesById.current.clear();
    // setCurrentItemIndex(0);

    const filter: NDKFilter = {
      kinds: [1],
      authors: authors,
      limit: 1000, // Fetch a large batch initially
    };

    const subscription: NDKSubscription = ndk.subscribe([filter], { closeOnEose: false });

    subscription.on('event', (event: NDKEvent) => {
      // Process events and update map, returns only *new* notes
      const newNotes = processEventsIntoMediaNotes([event], notesById.current);
      if (newNotes.length > 0) {
            console.log(`MediaFeed: Adding ${newNotes.length} new media notes from event ${event.id.substring(0,8)}.`);
            // Add new notes and re-sort the whole list
            setMediaNotes(prevNotes => {
              const combined = [...prevNotes, ...newNotes]; 
              // Sort using the correct createdAt property from MediaNote
              combined.sort((a: MediaNote, b: MediaNote) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
              // Ensure index stays valid if current item is removed by MAX_SLIDES limit (edge case)
              if (currentItemIndex >= Math.min(combined.length, MAX_SLIDES)) {
                  setCurrentItemIndex(0);
              }
              return combined;
          });
      }
    });

    subscription.on('eose', () => {
        console.log("MediaFeed: Subscription EOSE received.");
    });

    subscription.start();
    console.log("MediaFeed: Subscription started.");

    // Cleanup function
    return () => {
      console.log("MediaFeed: Cleaning up subscription.");
      subscription.stop();
    };

  // Re-run effect if NDK instance or authors list changes or cache is loaded
  }, [ndk, authors, isCacheLoaded]); 

  // --- Control Handlers --- 
  const cycleLength = Math.min(mediaNotes.length, MAX_SLIDES);

  const handlePrevious = () => {
    if (cycleLength === 0) return;
    setCurrentItemIndex((prevIndex) => (prevIndex - 1 + cycleLength) % cycleLength);
    setIsPlaying(true); // Assume autoplay on new item
  };

  const handleNext = () => {
    if (cycleLength === 0) return;
    setCurrentItemIndex((prevIndex) => (prevIndex + 1) % cycleLength);
    setIsPlaying(true); // Assume autoplay on new item
  };

  const handlePlayPause = () => {
    if (videoRef.current) {
        if (isPlaying) {
            videoRef.current.pause();
        } else {
            videoRef.current.play().catch(error => console.error("Video play failed:", error));
        }
        setIsPlaying(!isPlaying);
    }
  };

  const handleMuteToggle = () => {
    if (videoRef.current) {
        videoRef.current.muted = !isMuted;
        setIsMuted(!isMuted);
    }
  };

  // --- Effect to control video playback based on state/currentItem --- 
  useEffect(() => {
    if (!videoRef.current) return;

    const currentItem = mediaNotes[currentItemIndex];
    if (currentItem?.type === 'video') {
      videoRef.current.playbackRate = 1.0;
      if (isPlaying) {
        videoRef.current.play().catch(error => {
          console.error("Video autoplay failed:", error);
        });
      } else {
        videoRef.current.pause();
      }
      if (isMuted) {
        videoRef.current.muted = true;
      } else {
        videoRef.current.muted = false;
      }
    } else {
      videoRef.current.pause();
    }
  }, [currentItemIndex, isPlaying, isMuted, mediaNotes]);

  // Effect to cycle through media every 90 seconds
  useEffect(() => {
    if (mediaNotes.length <= 1) return; // No need to cycle if 0 or 1 item

    const interval = setInterval(() => {
      if (isPlaying) {
        setCurrentItemIndex((prevIndex) => (prevIndex + 1) % mediaNotes.length);
      }
    }, 90000); // 90 seconds

    return () => clearInterval(interval);
  }, [mediaNotes.length, isPlaying]);

  // --- Rendering Logic --- 
  // Get the items to actually display (latest MAX_SLIDES)
  const displayItems = mediaNotes.slice(0, MAX_SLIDES);

  // Handle the case where there are no items to display after filtering/fetching
  if (displayItems.length === 0) {
    console.log('MediaFeed: Rendering placeholder (no displayable items).');
    return (
      <div className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden">
        <p className="text-gray-400">Waiting for media feed...</p>
      </div>
    );
  }

  // Ensure index is valid within displayItems
  // currentItemIndex is updated by the timer effect, which uses cycleLength
  const currentItem = displayItems[currentItemIndex];

  if (!currentItem) {
      console.error("MediaFeed: currentItem is undefined. Index:", currentItemIndex, "Display count:", displayItems.length);
      return (
        <div className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden">
          <p className="text-red-500">Error loading media item.</p>
        </div>
      );
  }

  const isCurrentVideo = currentItem.type === 'video';

  return (
    <div className="relative w-full h-full bg-black flex flex-col items-center justify-center overflow-hidden">
        
        {/* Media Display Area */}
        <div className="w-full h-full flex items-center justify-center"> 
            {/* Use CSS to show/hide instead of conditional rendering to keep video ref stable */}
            <img 
                key={`${currentItem.id}-img`} // Key for image changes
                src={currentItem.type === 'image' ? currentItem.url : ''} // Only set src if image
                alt="Media content" 
                className={`object-contain max-h-full max-w-full ${currentItem.type === 'image' ? 'block' : 'hidden'}`} 
            />
            <video 
                ref={videoRef} 
                key={`${currentItem.id}-vid`} // Key needed if src changes aren't reliable enough
                src={currentItem.type === 'video' ? currentItem.url : undefined} // Set src only if video
                loop // Keep loop
                // Removed autoPlay, muted, controls - managed by state/ref
                className={`object-contain max-h-full max-w-full ${currentItem.type === 'video' ? 'block' : 'hidden'}`}
                // Handle potential errors loading video source
                onError={(e) => console.error("Video source error:", e)}
            />
        </div>

        {/* QR Code (Bottom Right) */}
        <div className="absolute bottom-2 right-2 md:bottom-4 md:right-4 z-20 bg-white p-1 rounded w-12 h-12 md:w-16 md:h-16 lg:w-20 lg:h-20">
            <QRCode
            value={`nostr:${currentItem.posterNpub}`}
            size={256}
            style={{ height: "auto", maxWidth: "100%", width: "100%" }}
            viewBox={`0 0 256 256`}
            level="L"
            />
        </div>

        {/* Video Controls (Bottom Center) - Play/Pause, Mute */}
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-10 flex space-x-4">
            {isCurrentVideo && (
                <>
                    {/* Play/Pause Button - Enforced Minimal */}
                    <button 
                        onClick={handlePlayPause} 
                        // Enforce no background/border. Change text color on hover/focus.
                        className="p-1 bg-transparent border-none text-purple-400 hover:text-purple-200 focus:text-purple-200 focus:outline-none transition-colors duration-150"
                        aria-label={isPlaying ? "Pause" : "Play"}
                    >
                        {/* SVG Icon */} 
                         {isPlaying ? 
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> 
                            : 
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        }
                    </button>
                    {/* Mute/Unmute Button - Enforced Minimal */}
                    <button 
                        onClick={handleMuteToggle} 
                         // Enforce no background/border. Change text color on hover/focus.
                        className="p-1 bg-transparent border-none text-purple-400 hover:text-purple-200 focus:text-purple-200 focus:outline-none transition-colors duration-150"
                        aria-label={isMuted ? "Unmute" : "Mute"}
                    >
                        {/* SVG Icon */} 
                          {isMuted ? 
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" clipRule="evenodd" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg>
                            : 
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                         }
                    </button>
                </>
            )}
        </div>

        {/* Prev Button (Absolute Left Edge) */}
        {cycleLength > 1 && (
             <button 
                onClick={handlePrevious} 
                // Change text color to purple-600, hover/focus to purple-400
                className="absolute left-0 top-1/2 transform -translate-y-1/2 z-10 bg-transparent border-none text-purple-600 hover:text-purple-400 focus:text-purple-400 focus:outline-none disabled:opacity-30 disabled:cursor-not-allowed transition-colors duration-150 m-0"
                disabled={cycleLength <= 1}
                aria-label="Previous Item"
             >
                 {/* SVG Icon - Add p-0 m-0 */}
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 p-0 m-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 5 L 13 12 L 15 19" />
                 </svg>
             </button>
        )}

        {/* Next Button (Absolute Right Edge) */}
        {cycleLength > 1 && (
            <button 
                onClick={handleNext} 
                 // Change text color to purple-600, hover/focus to purple-400
                className="absolute right-0 top-1/2 transform -translate-y-1/2 z-10 bg-transparent border-none text-purple-600 hover:text-purple-400 focus:text-purple-400 focus:outline-none disabled:opacity-30 disabled:cursor-not-allowed transition-colors duration-150 m-0"
                disabled={cycleLength <= 1}
                aria-label="Next Item"
            >
                {/* SVG Icon - Add p-0 m-0 */}
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 p-0 m-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5 L 11 12 L 9 19" />
                 </svg>
            </button>
        )}

    </div>
  );
};

export default MediaFeed; 