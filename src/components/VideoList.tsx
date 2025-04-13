import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNdk } from 'nostr-hooks';
import { NDKEvent, NDKFilter, NDKSubscription, NDKKind } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';
import { 
    ProfileData, 
    getProfileFromCache, 
    saveProfileToCache,
    parseProfileContent 
} from '../utils/profileCache';

// Interface for Video Notes
interface VideoNote {
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
  onVideoSelect: (url: string, posterNpub: string) => void;
}

const VideoList: React.FC<VideoListProps> = ({ authors, onVideoSelect }) => {
  const { ndk } = useNdk();
  const [videoNotes, setVideoNotes] = useState<VideoNote[]>([]);
  const notesById = useRef<Map<string, VideoNote>>(new Map());
  const [currentItemIndex, setCurrentItemIndex] = useState(0); // Index for focus tracking
  const [isCacheLoaded, setIsCacheLoaded] = useState(false);
  const scrollableListRef = useRef<HTMLDivElement>(null);
  
  // State for profiles (optional, but good for display)
  const [profiles, setProfiles] = useState<Record<string, ProfileData>>({});
  const processingPubkeys = useRef<Set<string>>(new Set());

  // Load video notes from cache on mount
  useEffect(() => {
    getVideoNotesFromCache()
      .then(cachedNotes => {
        console.log(`VideoList: Loaded ${cachedNotes.length} video notes from cache.`);
        setVideoNotes(cachedNotes);
        notesById.current = new Map(cachedNotes.map(note => [note.id, note]));
        setIsCacheLoaded(true);
      })
      .catch(err => {
        console.error('VideoList: Failed to load notes from cache:', err);
        setIsCacheLoaded(true);
      });
  }, []);

  // Fetch profile function (copied/adapted from Podcastr)
  const fetchVideoAuthorProfile = useCallback(async (pubkey: string) => {
    if (!ndk || !pubkey || profiles[pubkey]?.name || processingPubkeys.current.has(pubkey)) return;
    processingPubkeys.current.add(pubkey);
    setProfiles(prev => ({ ...prev, [pubkey]: { ...prev[pubkey], pubkey: pubkey, isLoading: true } }));
    try {
      const cached = await getProfileFromCache(pubkey);
      if (cached?.name) {
        setProfiles(prev => ({ ...prev, [pubkey]: { ...cached, isLoading: false } }));
        return;
      }
      const user = ndk.getUser({ pubkey });
      const profileEvent = await user.fetchProfile();
      let dataToSave: Omit<ProfileData, 'cachedAt' | 'isLoading'> | null = null;
      if (profileEvent?.content) {
          dataToSave = parseProfileContent(profileEvent.content, pubkey);
      } else if (profileEvent?.name || profileEvent?.picture) {
           dataToSave = {
                pubkey: pubkey,
                name: profileEvent.name,
                picture: profileEvent.picture,
                displayName: profileEvent.displayName,
           };
      }
      if (dataToSave) {
          setProfiles(prev => ({ ...prev, [pubkey]: { ...dataToSave, isLoading: false } }));
          saveProfileToCache({ ...dataToSave, pubkey }).catch(err => console.error(`VideoList: Failed cache save for ${pubkey.substring(0,8)}`, err));
      } else {
          setProfiles(prev => ({ ...prev, [pubkey]: { ...prev[pubkey], isLoading: false } }));
      }
    } catch (error) {
        console.error(`VideoList: Error fetching profile ${pubkey}:`, error);
        setProfiles(prev => ({ ...prev, [pubkey]: { ...prev[pubkey], isLoading: false } }));
    } finally {
        processingPubkeys.current.delete(pubkey);
    }
  }, [ndk]); // Removed profiles dependency

  // NDK Subscription Effect for Video Notes
  useEffect(() => {
    if (!ndk || authors.length === 0 || !isCacheLoaded) return;
    console.log(`VideoList: Subscribing for ${authors.length} authors...`);
    const filter: NDKFilter = { kinds: [NDKKind.Text], authors: authors, limit: 50 }; // Adjust limit? 
    const subscription = ndk.subscribe(filter, { closeOnEose: false });
    subscription.on('event', (event: NDKEvent) => {
        const newNotes = processEventsIntoVideoNotes([event], notesById.current);
        if (newNotes.length > 0) {
            console.log(`VideoList: Adding ${newNotes.length} new video notes.`);
            setVideoNotes(prevNotes => {
                const combined = [...newNotes, ...prevNotes]; 
                combined.sort((a, b) => b.createdAt - a.createdAt);
                // Limit displayed notes?
                const limitedNotes = combined.slice(0, 100); // Example limit
                saveVideoNotesToCache(newNotes).catch(err => console.error('VideoList: Failed cache save', err));
                notesById.current = new Map(limitedNotes.map(n => [n.id, n]));
                return limitedNotes;
            });
        }
    });
    subscription.on('eose', () => console.log("VideoList: Subscription EOSE."));
    subscription.start();
    return () => {
      console.log("VideoList: Cleaning up subscription.");
      subscription.stop();
    };
  }, [ndk, authors, isCacheLoaded]);

  // Effect to fetch profiles for visible notes
  useEffect(() => {
    const memoizedUniquePubkeys = useMemo(() => {
      // 1. Map to get all pubkeys (string | number)
      const allPubkeys = videoNotes.map(note => note.posterPubkey);
      // 2. Filter to get only valid strings, using a type predicate to narrow the type
      const stringPubkeys = allPubkeys.filter((pubkey): pubkey is string =>
        typeof pubkey === 'string' && pubkey.length > 0
      );
      // 3. Get unique strings using a Set and spread back into an array
      return [...new Set(stringPubkeys)]; // This is explicitly string[]
    }, [videoNotes]); // Dependency: only recalculate when videoNotes changes

    // Fetch profiles for the unique pubkeys
    memoizedUniquePubkeys.forEach(pubkey => {
      // Type should be string here due to the filter + Set logic above
      fetchVideoAuthorProfile(pubkey);
    });
  }, [videoNotes, fetchVideoAuthorProfile]); // Ensure fetchVideoAuthorProfile is a dependency

  // Effect for initial focus
   useEffect(() => {
      if (isCacheLoaded && videoNotes.length > 0 && scrollableListRef.current) {
          scrollableListRef.current.focus();
      }
  }, [isCacheLoaded, videoNotes]);

  const handleSelect = (note: VideoNote) => {
      let npub: string | null = null;
      try {
          npub = nip19.npubEncode(String(note.posterPubkey));
      } catch(e) { console.error("Failed to encode npub for video selection", e); }
      if (npub) {
          onVideoSelect(note.url, npub);
      }
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
          tabIndex={0} 
          className="flex-grow w-full overflow-y-auto pr-1 mb-2 focus:outline-none focus:ring-1 focus:ring-purple-400 rounded"
      >
        {videoNotes.map((note, index) => {
            const isSelected = index === currentItemIndex; // We might not need currentItemIndex state later
            const itemBg = isSelected ? 'bg-purple-800 bg-opacity-60' : 'bg-gray-700 bg-opacity-50 hover:bg-gray-600 hover:bg-opacity-70';
            const profile = profiles[note.posterPubkey];
            const itemDisplayName = profile?.name || profile?.displayName || note.posterPubkey.substring(0, 10) + '...';
            const itemPictureUrl = profile?.picture;
            const itemIsLoadingProfile = profile?.isLoading;

            return ( 
                <div
                    key={note.id}
                    tabIndex={-1} 
                    className={`flex items-center p-2 mb-1 rounded-md cursor-pointer transition-colors ${itemBg} focus:outline-none focus:ring-2 focus:ring-purple-500`}
                    onClick={() => { setCurrentItemIndex(index); handleSelect(note); }}
                    onFocus={() => setCurrentItemIndex(index)} // Update focus index
                    title={note.content || note.url} 
                >
                    {/* Video Icon? Or Thumbnail later? */}
                    <div className="flex-shrink-0 w-7 h-7 rounded bg-gray-600 flex items-center justify-center mr-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                    </div>
                    {/* Profile Picture */}
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-500 overflow-hidden mr-2">
                        {itemIsLoadingProfile ? (
                            <div className="w-full h-full animate-pulse bg-gray-400"></div>
                        ) : itemPictureUrl ? (
                            <img src={itemPictureUrl} alt={itemDisplayName} className="w-full h-full object-cover" onError={() => console.error(`VideoList: Failed profile img: ${itemPictureUrl}`)} />
                        ) : (
                            <span className="text-gray-300 text-xs font-semibold flex items-center justify-center h-full uppercase">
                                {itemDisplayName.substring(0, 1)}
                            </span>
                        )}
                    </div>
                    {/* Profile Name */}
                    <p className="text-sm text-gray-200 truncate flex-grow" title={itemDisplayName}>
                       {itemDisplayName} 
                    </p>
                </div>
            );
        })}
      </div>
    </div>
  );
};

export default VideoList; 