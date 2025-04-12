import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'react-qr-code';
import { useNdk } from 'nostr-hooks';
import { NDKEvent, NDKFilter, NDKSubscription } from '@nostr-dev-kit/ndk'; // Removed nip19 import from here
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
// Regex to find image/video URLs in note content
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
                if (mediaType) {
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

  // --- Subscription Effect --- 
  useEffect(() => {
    // Don't subscribe if NDK is not ready or authors list is empty
    if (!ndk || authors.length === 0) {
        // Clear notes if authors become empty
        if (authors.length === 0) {
            setMediaNotes([]);
            notesById.current.clear();
        }
        return;
    }

    console.log(`MediaFeed: Authors updated, creating subscription for ${authors.length} authors...`);

    // Clear previous state when authors change
    setMediaNotes([]);
    notesById.current.clear();
    setCurrentItemIndex(0);

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

  // Re-run effect if NDK instance or authors list changes
  }, [ndk, authors]); 


  // --- Slideshow Timer Effect --- 
  useEffect(() => {
    // Use mediaNotes from state for timer logic
    if (mediaNotes.length === 0) {
      setCurrentItemIndex(0); // Reset index if notes disappear
      return;
    }

    // Determine the actual number of slides to cycle through (up to MAX_SLIDES)
    const cycleLength = Math.min(mediaNotes.length, MAX_SLIDES);
    if (cycleLength === 0) return; // Should not happen if mediaNotes.length > 0, but safe check

    const timer = setInterval(() => {
      // Cycle only through the items being displayed (up to MAX_SLIDES)
      setCurrentItemIndex((prevIndex) => (prevIndex + 1) % cycleLength);
    }, 3500); // Switch every 3.5 seconds

    return () => clearInterval(timer);
  // Depend on the number of notes available (up to MAX_SLIDES)
  }, [mediaNotes.length]); 


  // --- Rendering Logic --- 
  // Get the items to actually display (latest MAX_SLIDES)
  const displayItems = mediaNotes.slice(0, MAX_SLIDES);

  // Handle the case where there are no items to display after filtering/fetching
  if (displayItems.length === 0) {
    console.log('MediaFeed: Rendering placeholder (no displayable items).');
    return (
      <div className="relative w-full h-[60%] bg-black flex items-center justify-center overflow-hidden">
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
        <div className="relative w-full h-[60%] bg-black flex items-center justify-center overflow-hidden">
          <p className="text-red-500">Error loading media item.</p>
        </div>
      );
  }

  return (
    <div className="relative w-full h-[60%] bg-black flex items-center justify-center overflow-hidden">
      {/* Use a key derived from the item ID AND index to force re-render on item change */}
      {currentItem.type === 'image' ? (
        <img key={`${currentItem.id}-${currentItemIndex}`} src={currentItem.url} alt="Media content" className="object-contain max-h-full max-w-full" />
      ) : (
        <video key={`${currentItem.id}-${currentItemIndex}`} src={currentItem.url} autoPlay loop muted controls className="object-contain max-h-full max-w-full" />
      )}
      <div className="absolute bottom-2 right-2 md:bottom-4 md:right-4 z-10 bg-white p-1 rounded w-12 h-12 md:w-16 md:h-16 lg:w-20 lg:h-20">
        <QRCode
          value={`nostr:${currentItem.posterNpub}`}
          size={256}
          style={{ height: "auto", maxWidth: "100%", width: "100%" }}
          viewBox={`0 0 256 256`}
          level="L"
        />
      </div>
    </div>
  );
};

export default MediaFeed; 