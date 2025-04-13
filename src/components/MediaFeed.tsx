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
interface MediaFeedProps {
  authors: string[]; // Expect list of hex pubkeys
}

const MAX_SLIDES = 30;
const SLIDE_DURATION_MS = 60000; // 60 seconds per slide
const FADE_DURATION_MS = 750; // 0.75 seconds fade

const MediaFeed: React.FC<MediaFeedProps> = ({ authors }) => {
  const { ndk } = useNdk(); // Get NDK instance
  const [mediaNotes, setMediaNotes] = useState<MediaNote[]>([]); // Local state for notes
  const notesById = useRef<Map<string, MediaNote>>(new Map()); // Track processed media IDs
  // currentItemIndex is now primarily managed by the cross-fade effect
  // const [currentItemIndex, setCurrentItemIndex] = useState(0); 
  const [isCacheLoaded, setIsCacheLoaded] = useState(false);
  
  // State for cross-fade
  const [currentImageIndex, setCurrentImageIndex] = useState(0); // Index for the visible image in the shuffled array
  const [previousImageIndex, setPreviousImageIndex] = useState<number | null>(null); // Index for the fading-out image
  const [isFading, setIsFading] = useState(false);

  // Timer ref
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Load from cache on component mount (already shuffles)
  useEffect(() => {
    getFromCache()
      .then(cachedNotes => {
        console.log(`MediaFeed: Loaded and shuffled ${cachedNotes.length} items from cache (limit ${MAX_CACHED_NOTES}).`);
        setMediaNotes(cachedNotes);
        notesById.current = new Map(cachedNotes.map(note => [note.id, note]));
        setIsCacheLoaded(true);
        setCurrentImageIndex(0); // Start fade from index 0 of shuffled array
      })
      .catch(err => {
        console.error('MediaFeed: Failed to load from cache:', err);
        setIsCacheLoaded(true);
      });
  }, []); 

  // --- Subscription Effect --- 
  useEffect(() => {
    if (!ndk || authors.length === 0 || !isCacheLoaded) {
      // Clear notes if authors become empty
      if (authors.length === 0) {
          setMediaNotes([]);
          notesById.current.clear();
          setCurrentImageIndex(0); // Reset index
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

  subscription.on('event', (event: NDKEvent) => {
    const newNotes = processEventsIntoMediaNotes([event], notesById.current);
    if (newNotes.length > 0) {
          console.log(`MediaFeed: Adding ${newNotes.length} new image notes from event ${event.id.substring(0,8)}.`);
          setMediaNotes(prevNotes => {
            // Add new notes
            let combined = [...prevNotes, ...newNotes]; 
            // --- SHUFFLE the combined list --- 
            let shuffledCombined = shuffleArray(combined);
            // Trim if over cache limit AFTER shuffling
            if (shuffledCombined.length > MAX_CACHED_NOTES) {
                console.log(`MediaFeed: Trimming shuffled notes from ${shuffledCombined.length} to ${MAX_CACHED_NOTES}`);
                // Note: Trimming after shuffling might discard some of the *new* notes if the cache was full.
                // Alternative: Trim by date *before* shuffling? Sticking with shuffle then trim for now.
                shuffledCombined = shuffledCombined.slice(0, MAX_CACHED_NOTES);
            }
            // Update the notesById map based on the final shuffled+trimmed list
            notesById.current = new Map(shuffledCombined.map(n => [n.id, n])); 
            
            // Ensure the currentImageIndex remains valid within the new array length
            const newLength = Math.min(shuffledCombined.length, MAX_SLIDES);
            if (newLength > 0 && currentImageIndex >= newLength) {
                console.log(`MediaFeed: Resetting currentImageIndex from ${currentImageIndex} due to notes update.`);
                // Resetting index might cause a visual jump, but prevents errors.
                // We directly return the shuffled array, the timer effect will use it.
                setCurrentImageIndex(0);
            } 
            // Return the shuffled, potentially trimmed list
            return shuffledCombined; 
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

  // --- Timer Effect for Cycling Slides with Cross-fade --- 
  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    // Use the current mediaNotes state directly, which should be shuffled
    const displayItems = mediaNotes.slice(0, MAX_SLIDES);
    const cycleLength = displayItems.length;

    if (cycleLength > 1) {
      console.log(`MediaFeed: Setting timer for ${SLIDE_DURATION_MS}ms. Current index: ${currentImageIndex}`);
      timerRef.current = setTimeout(() => {
        console.log(`MediaFeed: Timer fired. Fading from index ${currentImageIndex}`);
        setIsFading(true); 
        setPreviousImageIndex(currentImageIndex); 

        const nextIndex = (currentImageIndex + 1) % cycleLength;
        // setCurrentItemIndex(nextIndex); // We don't need this separate index now

        setTimeout(() => {
           console.log(`MediaFeed: Fade complete. Setting index to ${nextIndex}`);
           setCurrentImageIndex(nextIndex); // Update the image index for the next cycle
           setIsFading(false);
           setPreviousImageIndex(null); 
        }, FADE_DURATION_MS);

      }, SLIDE_DURATION_MS); // Use the updated longer duration
    }

    return () => {
      if (timerRef.current) {
        console.log("MediaFeed: Clearing timer due to cleanup/dependency change.");
        clearTimeout(timerRef.current);
      }
    };
  // Rerun timer logic if the image index changes OR the underlying notes array changes
  }, [currentImageIndex, mediaNotes]); 

  // --- Rendering Logic --- 
  const displayItems = mediaNotes.slice(0, MAX_SLIDES);

  if (displayItems.length === 0) {
    console.log('MediaFeed: Rendering placeholder (no displayable items).');
    return (
      <div className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden">
        <p className="text-gray-400">Waiting for media feed...</p>
      </div>
    );
  }

  // Use currentImageIndex directly
  const currentItem = displayItems[currentImageIndex]; 
  const previousItem = previousImageIndex !== null ? displayItems[previousImageIndex] : null;

  if (!currentItem) {
      console.error("MediaFeed: currentItem is undefined. Index:", currentImageIndex, "Display count:", displayItems.length);
      return (
        <div className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden">
          <p className="text-red-500">Error loading media item.</p>
        </div>
      );
  }

  // --- ADD LOGGING before QR Code --- 
  console.log("MediaFeed Rendering - currentItem:", currentItem);
  console.log("MediaFeed Rendering - currentItem.posterNpub:", currentItem?.posterNpub);

  const currentImageUrl = currentItem.type === 'image' ? currentItem.url : null;
  const previousImageUrl = previousItem?.type === 'image' ? previousItem.url : null;

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
      
      {/* Media Display Area with Cross-Fade (needs higher z-index than background) */}
      <div className="relative w-full h-full flex items-center justify-center z-10"> 
          {/* Current Image Layer */}
          {currentImageUrl && (
              <img 
                  key={`${currentItem.id}-img-current`} 
                  src={currentImageUrl} 
                  alt="Media content" 
                  className={`absolute inset-0 object-contain w-full h-full transition-opacity duration-${FADE_DURATION_MS} ease-in-out ${isFading ? 'opacity-0' : 'opacity-100'}`}
              />
          )}
          {/* Previous Image Layer (for fading out) */}
          {previousImageUrl && isFading && (
               <img 
                  key={`${previousItem?.id}-img-previous`} 
                  src={previousImageUrl} 
                  alt="Media content (fading out)" 
                  className={`absolute inset-0 object-contain w-full h-full transition-opacity duration-${FADE_DURATION_MS} ease-in-out opacity-0`}
              />             
          )}
          {/* Video Display (Placeholder - would need integration) */}
          {currentItem.type === 'video' && (
              <div className="w-full h-full flex items-center justify-center">
                  <p className="text-white bg-black bg-opacity-50 p-2 rounded">Video playback not fully integrated with fade yet.</p>
              </div>
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

    </div>
  );
};

export default MediaFeed; 