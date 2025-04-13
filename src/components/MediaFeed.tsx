import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'react-qr-code';
import { useNdk } from 'nostr-hooks';
import { NDKEvent, NDKFilter, NDKSubscription, NDKKind } from '@nostr-dev-kit/ndk'; // Removed nip19 import from here
import { nip19 } from 'nostr-tools'; // Import nip19 from nostr-tools

// Define MediaNote interface if not already defined
export interface MediaNote {
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
const DB_VERSION = 2;
const STORE_NAME = 'mediaNotes';

// Increased cache limit
const MAX_CACHED_NOTES = 500;

// --- Singleton DB Management for MediaFeedCache ---
let mediaDbInstance: IDBDatabase | null = null;
let mediaDbOpenPromise: Promise<IDBDatabase> | null = null;

async function _openMediaDB(): Promise<IDBDatabase> {
  console.log(`Attempting to open DB: ${DB_NAME} version ${DB_VERSION}`);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = (event) => {
        console.error(`IndexedDB error opening ${DB_NAME}:`, (event.target as IDBOpenDBRequest).error);
        reject((event.target as IDBOpenDBRequest).error);
    }
    request.onsuccess = (event) => {
        console.log(`IndexedDB ${DB_NAME} opened successfully.`);
        resolve((event.target as IDBOpenDBRequest).result);
    }
    request.onupgradeneeded = (event) => {
      console.log(`Upgrading IndexedDB ${DB_NAME} to version ${DB_VERSION}`);
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
            console.log(`Creating object store: ${STORE_NAME}`);
            try {
               db.createObjectStore(STORE_NAME, { keyPath: 'id' });
               console.log(`Object store ${STORE_NAME} created successfully.`);
            } catch (e) {
                console.error(`Error creating object store ${STORE_NAME}:`, e);
                reject(e); 
                 if (event.target && (event.target as IDBOpenDBRequest).transaction) {
                    try {
                       (event.target as IDBOpenDBRequest).transaction?.abort();
                    } catch (abortError) {
                       console.error("Error aborting transaction during failed upgrade:", abortError);
                    }
                }
                return; 
            }
         } else {
            console.log(`Object store ${STORE_NAME} already exists.`);
         }
    };
  });
}

function getMediaDbInstance(): Promise<IDBDatabase> {
    if (mediaDbInstance) {
        return Promise.resolve(mediaDbInstance);
    }
    if (mediaDbOpenPromise) {
        return mediaDbOpenPromise;
    }
    console.log("Initiating new MediaFeedCache DB connection promise.");
    mediaDbOpenPromise = _openMediaDB();

    mediaDbOpenPromise
        .then(db => {
            console.log("MediaFeedCache DB connection promise resolved successfully.");
            mediaDbInstance = db;
            mediaDbOpenPromise = null;
            mediaDbInstance.onclose = () => {
                console.warn(`IndexedDB ${DB_NAME} connection closed unexpectedly.`);
                mediaDbInstance = null;
            };
            return db;
        })
        .catch(err => {
            console.error("MediaFeedCache DB connection promise failed:", err);
            mediaDbOpenPromise = null;
            throw err;
        });

    return mediaDbOpenPromise;
}
// --- End Singleton DB Management ---


async function saveToCache(notes: MediaNote[]): Promise<void> {
  const db = await getMediaDbInstance(); // Use singleton getter
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error("MediaFeedCache DB not available for saving."));
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    notes.forEach(note => store.put(note));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

// Fisher-Yates (Knuth) Shuffle algorithm
function shuffleArray<T>(array: T[]): T[] {
  let currentIndex = array.length, randomIndex;

  // While there remain elements to shuffle.
  while (currentIndex !== 0) {

    // Pick a remaining element.
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    // And swap it with the current element.
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex], array[currentIndex]];
  }

  return array;
}


async function getFromCache(): Promise<MediaNote[]> {
  const db = await getMediaDbInstance(); // Use singleton getter
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error("MediaFeedCache DB not available for getting."));
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => {
      let notes = request.result as MediaNote[]; // Explicit type
      // Sort by createdAt descending (newest first) initially
      notes.sort((a: MediaNote, b: MediaNote) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
      // Limit to the most recent MAX_CACHED_NOTES items
      if (notes.length > MAX_CACHED_NOTES) {
        const excessIds = notes.slice(MAX_CACHED_NOTES).map((n: MediaNote) => n.id);
        // Call deleteExcessFromCache without awaiting db again inside
        _deleteExcessFromCacheInternal(db, excessIds);
        notes = notes.slice(0, MAX_CACHED_NOTES);
      }
      // Shuffle the notes before resolving
      resolve(shuffleArray(notes)); 
    };
    request.onerror = () => reject(request.error);
  });
}

// Internal helper to delete within an existing transaction context if possible, or create new one
async function _deleteExcessFromCacheInternal(db: IDBDatabase, ids: string[]): Promise<void> {
     if (ids.length === 0) return Promise.resolve();
     console.log(`MediaFeed: Deleting ${ids.length} excess cached items.`);
     return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        ids.forEach(id => store.delete(id));
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
}

// Optional: Keep an exported version if needed externally, but it will open a new DB connection
async function deleteExcessFromCache(ids: string[]): Promise<void> {
  const db = await getMediaDbInstance(); // Use singleton getter
  return _deleteExcessFromCacheInternal(db, ids); // Delegate to internal function
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
                // --- Explicitly check for 'image' type --- 
                if (mediaType === 'image') { 
                    const mediaItemId = `${event.id}-${index}`;
                    if (!notesByIdMap.has(mediaItemId)) {
                        const newNote: MediaNote = {
                            id: mediaItemId,
                            eventId: event.id,
                            type: 'image', // Explicitly set type
                            url: url,
                            posterNpub: posterNpub!, // Non-null assertion as it's checked above
                            createdAt: event.created_at ?? Math.floor(Date.now() / 1000), 
                        };
                        notesByIdMap.set(mediaItemId, newNote);
                        newNotes.push(newNote);
                    }
                } else {
                    // Optional: Log ignored non-image media types
                    // console.log(`MediaFeed: Ignoring non-image media type (${mediaType}) found in event ${event.id}: ${url}`);
                }
            });
        }
    });
    // No need to sort here if shuffling happens later
    // newNotes.sort((a, b) => b.createdAt - a.createdAt);
    if (newNotes.length > 0) {
      // Saving to cache might still save all notes processed initially,
      // consider filtering notes passed to saveToCache if that's an issue.
      saveToCache(newNotes).catch(err => console.error('MediaFeed: Failed to save to cache:', err));
    }
    return newNotes; // Return only the newly processed IMAGE notes
};
// --- End Re-integrated Helper Logic ---


// Update props interface
export interface MediaFeedProps {
  authors: string[];
  handlePrevious: () => void;
  handleNext: () => void;
  mediaMode: 'podcast' | 'video';
  currentImageIndex: number;
  imageNotes: MediaNote[];
  onNotesLoaded: (notes: MediaNote[]) => void;
  interactiveMode: 'podcast' | 'video';
  toggleInteractiveMode: () => void;
}

const MAX_SLIDES = 30;

// --- Funny Loading Messages ---
const loadingMessages = [
  "Waking up the hamsters...",
  "Connecting to the Citadels...",
  "Zapping relays for content...",
  "Brewing cyber-coffee...",
  "Untangling the timelines...",
  "Asking Plebs for pictures...",
  "Ignoring shitposts (mostly)...",
  "Dusting off the memes...",
  "Reticulating splines... Nostr style!",
  "Don't trust, verify... images loading."
];

// Accept new props
const MediaFeed: React.FC<MediaFeedProps> = ({ 
  authors, 
  handlePrevious, 
  handleNext, 
  mediaMode, 
  currentImageIndex, 
  imageNotes, 
  onNotesLoaded, 
  interactiveMode,
  toggleInteractiveMode
}) => {
  const { ndk } = useNdk();
  const notesById = useRef<Map<string, MediaNote>>(new Map());
  const [isCacheLoaded, setIsCacheLoaded] = useState(false);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);

  // Effect for cycling loading messages
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;
    if (!isCacheLoaded) {
      // Start cycling messages
      intervalId = setInterval(() => {
        setLoadingMessageIndex(prevIndex => 
          (prevIndex + 1) % loadingMessages.length
        );
      }, 2500); // Change message every 2.5 seconds
    }

    // Cleanup function
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isCacheLoaded]); // Re-run when cache loading state changes

  // Load from cache on component mount
  useEffect(() => {
    getFromCache()
      .then(cachedNotes => {
        console.log(`MediaFeed: Loaded and shuffled ${cachedNotes.length} items from cache.`);
        onNotesLoaded(cachedNotes);
        notesById.current = new Map(cachedNotes.map(note => [note.id, note]));
        setIsCacheLoaded(true);
      })
      .catch(err => {
        console.error('MediaFeed: Failed to load from cache:', err);
        setIsCacheLoaded(true);
      });
  }, [onNotesLoaded]);

  // --- Subscription Effect --- 
  useEffect(() => {
    if (!ndk || authors.length === 0 || !isCacheLoaded) {
      if (authors.length === 0) {
          onNotesLoaded([]);
          notesById.current.clear();
      }
      return;
    }

    console.log(`MediaFeed: Authors updated, creating subscription for ${authors.length} authors...`);

    const filter: NDKFilter = {
      kinds: [1],
      authors: authors,
      limit: 1000, 
    };

    const subscription: NDKSubscription = ndk.subscribe([filter], { closeOnEose: false });

    if (notesById.current.size === 0 && imageNotes.length > 0) {
       console.log("MediaFeed: Initializing notesById from prop imageNotes.");
       notesById.current = new Map(imageNotes.map(note => [note.id, note]));
    }

    subscription.on('event', (event: NDKEvent) => {
      const newNotes = processEventsIntoMediaNotes([event], notesById.current);
      if (newNotes.length > 0) {
            let combined = [...imageNotes, ...newNotes];
            let shuffledCombined = shuffleArray(combined);
            if (shuffledCombined.length > MAX_CACHED_NOTES) {
                shuffledCombined = shuffledCombined.slice(0, MAX_CACHED_NOTES);
            }
            notesById.current = new Map(shuffledCombined.map(n => [n.id, n]));
            
            saveToCache(newNotes).catch(err => console.error('MediaFeed: Failed cache save', err));
            
            onNotesLoaded(shuffledCombined);
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
  }, [ndk, authors, isCacheLoaded, imageNotes, onNotesLoaded]); 

  // --- Rendering Logic --- 
  
  // Only render image slideshow content if in podcast/image mode
  if (mediaMode !== 'podcast') {
    // In video mode, this component doesn't display the main content
    // App.tsx handles showing the VideoPlayer.
    // We might want a placeholder or nothing, returning null is simplest.
    return null; 
  }

  // Rendering logic for IMAGE MODE:
  const displayItems = imageNotes.slice(0, MAX_SLIDES);

  // --- Updated Loading/Empty State Rendering ---
  if (!isCacheLoaded) {
    // Initial loading state: Show spinner and cycling message
    return (
      <div className="relative w-full h-full bg-black flex flex-col items-center justify-center overflow-hidden text-center">
        {/* Simple SVG Spinner */}
        <svg className="animate-spin -ml-1 mr-3 h-10 w-10 text-purple-500 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p className="text-gray-400 text-lg animate-pulse">
          {loadingMessages[loadingMessageIndex]}
        </p>
      </div>
    );
  } else if (displayItems.length === 0) {
    // Cache loaded, but no items to display
    return (
      <div className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden">
        <p className="text-gray-400 text-lg">No images found from followed zappers.</p>
      </div>
    );
  }

  // --- Render actual content when loaded and available ---
  const currentItem = displayItems[currentImageIndex];

  if (!currentItem) {
      console.error("MediaFeed: currentItem is undefined. Index:", currentImageIndex, "Display count:", displayItems.length);
      return (
        <div className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden">
          <p className="text-red-500">Error loading media item.</p>
        </div>
      );
  }

  const currentImageUrl = currentItem.type === 'image' ? currentItem.url : null;

  return (
    <div className="relative w-full h-full bg-transparent flex flex-col items-center justify-center overflow-hidden">
      {/* Ambient Background - Use fixed positioning and low z-index */}
      {currentImageUrl && (
          <div 
              className="fixed inset-0 z-[-1] transition-all duration-1000 ease-in-out" // Use fixed, inset-0, z-[-1]
              style={{
                  backgroundImage: `url(${currentImageUrl})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  filter: 'blur(40px) brightness(0.6)', 
                  transform: 'scale(1.1)' 
              }}
          />
      )}
      
      {/* Media Display Area - Simplified for single image */}
      <div className="relative w-full h-full flex items-center justify-center z-10">
          {currentImageUrl && (
              <img 
                  key={`${currentItem.id}-img-current`} 
                  src={currentImageUrl} 
                  alt="Media content" 
                  // Remove fade classes
                  className={`absolute inset-0 object-contain w-full h-full`}
              />
          )}
      </div>

      {/* QR Code (Ensure high z-index) */}
      {currentItem.posterNpub ? (
          <div className="absolute bottom-2 right-2 md:bottom-4 md:right-4 z-20 bg-white p-1 rounded w-12 h-12 md:w-16 md:h-16 lg:w-20 lg:h-20">
              <QRCode
              value={`nostr:${currentItem.posterNpub}`}
              size={256}
              style={{ height: "auto", maxWidth: "100%", width: "100%" }}
              viewBox={`0 0 256 256`}
              level="L"
              />
          </div>
      ) : (
          (() => { 
              console.log(`MediaFeed: QR Code not rendered for item ${currentItem.id} - missing posterNpub.`); 
              return null; 
          })()
      )}

      {/* <<< RE-ADD Toggle Button Here (Bottom Right, offset from QR) >>> */}
      <div 
          // Position to the left of the QR code
          className={`absolute bottom-4 right-24 md:right-28 lg:right-32 z-20 flex items-center`}
      > 
          <button 
              onClick={toggleInteractiveMode}
              className="p-1 bg-black bg-opacity-60 rounded 
                         text-purple-400 hover:text-purple-200 focus:text-purple-200 
                         focus:outline-none transition-colors duration-150 text-xs font-semibold uppercase"
              aria-label={interactiveMode === 'podcast' ? 'Show Video List' : 'Show Podcasts'}
              title={interactiveMode === 'podcast' ? 'Show Video List' : 'Show Podcasts'}
          >
              {interactiveMode === 'podcast' ? 'Videos' : 'Podcasts'}
          </button>
      </div>

    </div>
  );
};

export default MediaFeed; 