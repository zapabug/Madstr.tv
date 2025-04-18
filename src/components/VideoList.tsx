import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNdk } from 'nostr-hooks';
import { NDKEvent, NDKFilter, NDKSubscription, NDKKind } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';

// Interface for Video Notes
export interface VideoNote {
  id: string; // Unique ID: eventId-urlIndex
  eventId: string; // Original event ID
  type: 'video';
  url: string;
  posterPubkey: string; // Store hex pubkey
  createdAt: number;
  content?: string; // Optional content for display
}

// --- Video Note Caching --- (Similar to Podcastr)
const VIDEO_NOTE_DB_NAME = 'VideoNoteCache'; 
const VIDEO_NOTE_DB_VERSION = 1;
const VIDEO_NOTE_STORE_NAME = 'videoNotes'; 

async function openVideoNoteDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(VIDEO_NOTE_DB_NAME, VIDEO_NOTE_DB_VERSION);
        request.onerror = (event) => reject((event.target as IDBOpenDBRequest).error);
        request.onsuccess = (event) => resolve((event.target as IDBOpenDBRequest).result);
        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
             if (!db.objectStoreNames.contains(VIDEO_NOTE_STORE_NAME)) {
                db.createObjectStore(VIDEO_NOTE_STORE_NAME, { keyPath: 'id' });
            }
        };
    });
}

async function saveVideoNotesToCache(notes: VideoNote[]): Promise<void> {
    if (notes.length === 0) return;
    const db = await openVideoNoteDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([VIDEO_NOTE_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(VIDEO_NOTE_STORE_NAME);
        notes.forEach(note => store.put(note));
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
}

async function getVideoNotesFromCache(): Promise<VideoNote[]> {
    const db = await openVideoNoteDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([VIDEO_NOTE_STORE_NAME], 'readonly');
        const store = transaction.objectStore(VIDEO_NOTE_STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => {
            const notes = (request.result || []) as VideoNote[];
            notes.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
            // Limit cache size? Let's keep it simple for now.
            resolve(notes);
        };
        request.onerror = () => reject(request.error);
    });
}
// --- End Video Note Caching ---

// Regex to find image/video URLs
const mediaUrlRegex = /https?:\/\S+\.(?:png|jpg|jpeg|gif|webp|mp4|mov|webm)/gi;
// Helper to determine media type from URL
function getMediaType(url: string): 'image' | 'video' | null {
  const extension = url.split('.').pop()?.toLowerCase();
  if (!extension) return null;
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(extension)) return 'image';
  if (['mp4', 'mov', 'webm'].includes(extension)) return 'video';
  return null;
}

// Process events into VIDEO notes
const processEventsIntoVideoNotes = (events: NDKEvent[], notesByIdMap: Map<string, VideoNote>): VideoNote[] => {
  const newNotes: VideoNote[] = [];
  events.forEach(event => {
    const content = event.content;
    const matchedUrls = content.match(mediaUrlRegex);
    const posterPubkey = event.pubkey;

    if (matchedUrls && matchedUrls.length > 0) {
      matchedUrls.forEach((url, index) => {
        const mediaType = getMediaType(url);
        if (mediaType === 'video') { // Only process videos
          const mediaItemId = `${event.id}-${index}`;
          if (!notesByIdMap.has(mediaItemId)) {
            const newNote: VideoNote = {
              id: mediaItemId,
              eventId: event.id,
              type: 'video',
              url: url,
              posterPubkey: posterPubkey,
              createdAt: event.created_at ?? Math.floor(Date.now() / 1000),
              content: content,
            };
            notesByIdMap.set(mediaItemId, newNote);
            newNotes.push(newNote);
          }
        }
      });
    }
  });
  // No need to sort here if sorting happens in setVideoNotes
  return newNotes;
};

export interface VideoListProps {
  authors: string[];
  onVideoSelect: (url: string | null, posterNpub: string | null, index: number) => void;
  currentVideoIndex: number;
  videoNotes: VideoNote[];
  onNotesLoaded: (notes: VideoNote[]) => void;
}

const VideoList: React.FC<VideoListProps> = ({ 
  authors, 
  onVideoSelect, 
  currentVideoIndex, 
  videoNotes,
  onNotesLoaded 
}) => {
  const { ndk } = useNdk();
  const notesById = useRef<Map<string, VideoNote>>(new Map());
  const [isCacheLoaded, setIsCacheLoaded] = useState(false);
  const scrollableListRef = useRef<HTMLDivElement>(null);
  
  // Load video notes from cache on mount
  useEffect(() => {
    getVideoNotesFromCache()
      .then(cachedNotes => {
        console.log(`VideoList: Loaded ${cachedNotes.length} video notes from cache.`);
        onNotesLoaded(cachedNotes);
        notesById.current = new Map(cachedNotes.map(note => [note.id, note]));
        setIsCacheLoaded(true);
      })
      .catch(err => {
        console.error('VideoList: Failed to load notes from cache:', err);
        setIsCacheLoaded(true);
      });
  }, [onNotesLoaded]);

  // NDK Subscription Effect for Video Notes
  useEffect(() => {
    if (!ndk || authors.length === 0 || !isCacheLoaded) return;
    
    if (notesById.current.size === 0 && videoNotes.length > 0) {
       console.log("VideoList: Initializing notesById from prop videoNotes.");
       notesById.current = new Map(videoNotes.map(note => [note.id, note]));
    }

    console.log(`VideoList: Subscribing for ${authors.length} authors...`);
    const filter: NDKFilter = { kinds: [NDKKind.Text], authors: authors, limit: 50 }; 
    const subscription = ndk.subscribe(filter, { closeOnEose: false });
    
    subscription.on('event', (event: NDKEvent) => {
        const newNotes = processEventsIntoVideoNotes([event], notesById.current);
        if (newNotes.length > 0) {
            console.log(`VideoList: Adding ${newNotes.length} new video notes.`);
            const combined = [...newNotes, ...videoNotes];
            combined.sort((a, b) => b.createdAt - a.createdAt);
            const limitedNotes = combined.slice(0, 100);
            
            notesById.current = new Map(limitedNotes.map(n => [n.id, n]));
            
            saveVideoNotesToCache(newNotes).catch(err => console.error('VideoList: Failed cache save', err));
            
            onNotesLoaded(limitedNotes);
        }
    });
    subscription.on('eose', () => console.log("VideoList: Subscription EOSE."));
    subscription.start();
    return () => {
      console.log("VideoList: Cleaning up subscription.");
      subscription.stop();
    };
  }, [ndk, authors, isCacheLoaded, videoNotes, onNotesLoaded]);

  const handleSelect = (note: VideoNote, index: number) => {
      let npub: string | null = null;
      try {
          npub = nip19.npubEncode(String(note.posterPubkey));
      } catch(e) { console.error("Failed to encode npub for video selection", e); }
      onVideoSelect(note.url, npub, index);
  };

  if (!isCacheLoaded) {
    return <div className="p-4 text-center text-gray-500">Loading Videos...</div>;
  }
  if (videoNotes.length === 0) {
    return <div className="p-4 text-center text-gray-500">No videos found.</div>;
  }

  return (
    <div className='relative w-full h-full bg-gray-800 flex flex-col overflow-hidden p-2 text-white rounded-lg'>
      <h3 className="text-sm font-semibold text-purple-300 mb-2 pl-1">Video List</h3>
      {/* Scrollable Video List */}
      <div
          ref={scrollableListRef}
          className="flex-grow w-full overflow-y-auto pr-1 mb-2 rounded"
      >
        {videoNotes.map((note, index) => {
            const isSelected = index === currentVideoIndex;
            const itemBg = isSelected ? 'bg-purple-800 bg-opacity-60' : 'bg-gray-700 bg-opacity-50 hover:bg-gray-600 hover:bg-opacity-70';
            // Use posterPubkey directly as fallback display name
            const itemDisplayName = note.posterPubkey.substring(0, 10) + '...';

            // Handler for Enter/Space on individual items
            const handleItemKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
              if (event.key === 'Enter' || event.key === ' ') {
                handleSelect(note, index);
                event.preventDefault();
              }
            };

            return (
                <div
                    key={note.id}
                    tabIndex={0}
                    className={`flex items-center p-2 mb-1 rounded-md cursor-pointer transition-colors ${itemBg} focus:outline-none focus:ring-2 focus:ring-purple-500`}
                    onClick={() => handleSelect(note, index)}
                    onKeyDown={handleItemKeyDown}
                    title={note.content || note.url}
                >
                    {/* Video Icon? Or Thumbnail later? */}
                    <div className="flex-shrink-0 w-7 h-7 rounded bg-gray-600 flex items-center justify-center mr-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                    </div>
                </div>
            );
        })}
      </div>
    </div>
  );
};

export default VideoList; 