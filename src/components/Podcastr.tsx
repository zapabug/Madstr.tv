import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNdk } from 'nostr-hooks';
import { NDKEvent, NDKFilter, NDKSubscription, NDKKind, NDKUserProfile } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';
// Import shared profile cache utilities
import { 
    ProfileData, 
    getProfileFromCache, 
    saveProfileToCache,
    parseProfileContent 
} from '../utils/profileCache'; // Adjust path as needed

// Updated interface to store pubkey directly and add content
interface PodcastNote {
  id: string; // Unique ID: eventId-urlIndex
  eventId: string; // Original event ID
  type: 'podcast';
  url: string;
  posterPubkey: string; // Store hex pubkey
  createdAt: number;
  content?: string; // Re-add optional content field
}

// Remove local ProfileData interface and podcast-specific profile cache functions
// Remove local podcast note cache functions (we will use the shared profile cache for consistency)

// --- Unified Podcast Note Caching (Using Existing Functions) ---
const PODCAST_NOTE_DB_NAME = 'PodcastNoteCache'; 
const PODCAST_NOTE_DB_VERSION = 1;
const PODCAST_NOTE_STORE_NAME = 'podcastNotes'; 

async function openPodcastNoteDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(PODCAST_NOTE_DB_NAME, PODCAST_NOTE_DB_VERSION);
        request.onerror = (event) => reject((event.target as IDBOpenDBRequest).error);
        request.onsuccess = (event) => resolve((event.target as IDBOpenDBRequest).result);
        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
             if (!db.objectStoreNames.contains(PODCAST_NOTE_STORE_NAME)) {
                db.createObjectStore(PODCAST_NOTE_STORE_NAME, { keyPath: 'id' });
            }
        };
    });
}

async function savePodcastNotesToCache(notes: PodcastNote[]): Promise<void> {
    if (notes.length === 0) return;
    const db = await openPodcastNoteDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([PODCAST_NOTE_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(PODCAST_NOTE_STORE_NAME);
        notes.forEach(note => store.put(note));
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
}

async function getPodcastNotesFromCache(): Promise<PodcastNote[]> {
    const db = await openPodcastNoteDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([PODCAST_NOTE_STORE_NAME], 'readonly');
        const store = transaction.objectStore(PODCAST_NOTE_STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => {
            const notes = request.result || [];
            notes.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
            const limit = 50; 
            if (notes.length > limit) {
                resolve(notes.slice(0, limit));
            } else {
                resolve(notes);
            }
        };
        request.onerror = () => reject(request.error);
    });
}
// --- End Unified Podcast Note Caching ---

const podcastUrlRegex = /https?:\/\S+\.(?:mp3|m4a|wav)/gi;

function getMediaType(url: string): 'podcast' | null {
  const extension = url.split('.').pop()?.toLowerCase();
  if (!extension) return null;
  if (['mp3', 'm4a', 'wav'].includes(extension)) {
    return 'podcast';
  }
  return null;
}

// Updated function to store pubkey
const processEventsIntoPodcastNotes = (events: NDKEvent[], notesByIdMap: Map<string, PodcastNote>): PodcastNote[] => {
  const newNotes: PodcastNote[] = [];
  events.forEach(event => {
    const content = event.content;
    const matchedUrls = content.match(podcastUrlRegex);
    const posterPubkey = event.pubkey;

    if (matchedUrls && matchedUrls.length > 0) {
      matchedUrls.forEach((url, index) => {
        const mediaType = getMediaType(url);
        if (mediaType) { 
          const mediaItemId = `${event.id}-${index}`;
          if (!notesByIdMap.has(mediaItemId)) {
            const newNote: PodcastNote = {
              id: mediaItemId,
              eventId: event.id,
              type: mediaType,
              url: url,
              posterPubkey: posterPubkey, // Store pubkey
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
  newNotes.sort((a, b) => b.createdAt - a.createdAt);
  return newNotes;
};

interface PodcastPlayerProps {
  authors: string[]; // Expect list of hex pubkeys
}

// Rename component to Podcastr
const Podcastr: React.FC<PodcastPlayerProps> = ({ authors }) => {
  const { ndk } = useNdk();
  const [podcastNotes, setPodcastNotes] = useState<PodcastNote[]>([]);
  const notesById = useRef<Map<string, PodcastNote>>(new Map());
  const [currentItemIndex, setCurrentItemIndex] = useState(0);
  const [isCacheLoaded, setIsCacheLoaded] = useState(false); // Cache for notes
  const audioRef = useRef<HTMLAudioElement>(null);

  // --- Add State for Profiles ---
  const [profiles, setProfiles] = useState<Record<string, ProfileData>>({}); // State for poster profiles
  const processingPubkeys = useRef<Set<string>>(new Set()); // Track profiles being fetched
  // No need for separate profile cache loaded state, piggyback on note cache

  // Load podcast notes from cache on mount
  useEffect(() => {
    getPodcastNotesFromCache() // Use note cache function
      .then(cachedNotes => {
        console.log(`PodcastPlayer: Loaded ${cachedNotes.length} podcast notes from cache.`);
        setPodcastNotes(cachedNotes);
        notesById.current = new Map(cachedNotes.map(note => [note.id, note]));
        setIsCacheLoaded(true);
        if (cachedNotes.length > 0 && currentItemIndex >= cachedNotes.length) {
          setCurrentItemIndex(0); 
        }
        // Optimization: Pre-load profiles for cached notes?
        // Could iterate cachedNotes and call fetchProfile if not in profiles state yet.
      })
      .catch(err => {
        console.error('PodcastPlayer: Failed to load notes from cache:', err);
        setIsCacheLoaded(true); 
      });
  }, []); 

   // --- Function to Fetch Profiles (Fix Dependency Loop) --- 
  const fetchProfile = useCallback(async (pubkey: string) => {
    if (!ndk || !pubkey || processingPubkeys.current.has(pubkey)) {
      // Don't fetch if no NDK, no pubkey, or already fetching
      // We check cache *inside* after confirming we should fetch
      return;
    }
    
    // Check if profile name *already exists* using functional update form to access latest state
    let profileExists = false;
    setProfiles(prev => {
        if (prev[pubkey]?.name) {
            profileExists = true; 
        }
        return prev; // No state change here, just checking
    });
    if (profileExists) return; // Exit if profile name found in state

    // Check shared cache first
    try {
      const cachedProfile = await getProfileFromCache(pubkey); 
      if (cachedProfile && cachedProfile.name) { 
        // Use functional update form for setProfiles
        setProfiles(prev => ({
           ...prev, 
           [pubkey]: { ...cachedProfile, isLoading: false }
        }));
        return;
      }
    } catch (err) {
      console.error(`Podcastr: Error checking shared cache for ${pubkey.substring(0, 8)}:`, err);
    }

    // console.log(`Podcastr: Fetching profile for ${pubkey.substring(0, 8)}...`);
    processingPubkeys.current.add(pubkey);
    // Use functional update form for setProfiles
    setProfiles(prev => ({ ...prev, [pubkey]: { ...prev[pubkey], pubkey: pubkey, isLoading: true } }));

    try {
      const user = ndk.getUser({ pubkey });
      const profileEvent = await user.fetchProfile();
      
      if (profileEvent && typeof profileEvent.content === 'string') {
        const parsedProfileData = parseProfileContent(profileEvent.content, pubkey);
        if (parsedProfileData) {
            // Use functional update form for setProfiles
            setProfiles(prev => ({ 
              ...prev, 
              [pubkey]: { ...parsedProfileData, isLoading: false }
            }));
            saveProfileToCache({ ...parsedProfileData, pubkey }).catch(err => 
                console.error(`Podcastr: Failed to save profile to shared cache for ${pubkey.substring(0, 8)}:`, err)
            );
        } else {
             // Use functional update form for setProfiles
             setProfiles(prev => ({ ...prev, [pubkey]: { ...prev[pubkey], pubkey: pubkey, isLoading: false } }));
        }
      } else {
        // Use functional update form for setProfiles
        setProfiles(prev => ({ ...prev, [pubkey]: { ...prev[pubkey], pubkey: pubkey, isLoading: false } }));
      }
    } catch (error) {
      console.error(`Podcastr: Error fetching profile for ${pubkey}:`, error);
      // Use functional update form for setProfiles
      setProfiles(prev => ({ ...prev, [pubkey]: { ...prev[pubkey], pubkey: pubkey, isLoading: false } }));
    } finally {
        processingPubkeys.current.delete(pubkey);
    }
  // REMOVED profiles dependency to fix loop
  }, [ndk]); 

  // NDK Subscription Effect for Podcast Notes
  useEffect(() => {
    if (!ndk || authors.length === 0 || !isCacheLoaded) {
      if (authors.length === 0) {
        setPodcastNotes([]);
        notesById.current.clear();
        setCurrentItemIndex(0);
      }
      return;
    }
    console.log(`PodcastPlayer: Subscribing for ${authors.length} authors...`);
    const filter: NDKFilter = {
      kinds: [NDKKind.Text], 
      authors: authors,
      limit: 50, 
    };
    const subscription = ndk.subscribe(filter, { closeOnEose: false });
    subscription.on('event', (event: NDKEvent) => {
      const newNotes = processEventsIntoPodcastNotes([event], notesById.current);
      if (newNotes.length > 0) {
        console.log(`PodcastPlayer: Adding ${newNotes.length} new podcast notes.`);
        setPodcastNotes(prevNotes => {
          const combined = [...newNotes, ...prevNotes]; 
          combined.sort((a, b) => b.createdAt - a.createdAt);
          const limitedNotes = combined.slice(0, 50);
          savePodcastNotesToCache(newNotes).catch(err => console.error('PodcastPlayer: Failed to save new notes to cache:', err));
          notesById.current = new Map(limitedNotes.map(n => [n.id, n]));
          return limitedNotes;
        });
      }
    });
    subscription.on('eose', () => { console.log("PodcastPlayer: Subscription EOSE."); });
    subscription.start();
    return () => {
      console.log("PodcastPlayer: Cleaning up subscription.");
      subscription.stop();
    };
  }, [ndk, authors, isCacheLoaded]);

  const currentItem = podcastNotes[currentItemIndex];
  const currentProfile = currentItem ? profiles[currentItem.posterPubkey] : null;

  // --- Effect to fetch profile for the CURRENT item ---
  useEffect(() => {
      if (currentItem && currentItem.posterPubkey) {
          fetchProfile(currentItem.posterPubkey);
      }
  }, [currentItem, fetchProfile]); // Trigger when currentItem changes

  const handleNext = () => {
    if (podcastNotes.length === 0) return;
    setCurrentItemIndex((prev) => (prev + 1) % podcastNotes.length);
  };

  const handlePrevious = () => {
    if (podcastNotes.length === 0) return;
    setCurrentItemIndex((prev) => (prev - 1 + podcastNotes.length) % podcastNotes.length);
  };

  // Effect to update audio source when currentItem changes
  useEffect(() => {
    if (audioRef.current && currentItem) {
      audioRef.current.src = currentItem.url;
      audioRef.current.load(); 
    }
  }, [currentItem]);


  if (!isCacheLoaded) {
    return (
        <div className='relative w-full h-full bg-gray-800 flex items-center justify-center overflow-hidden p-4'>
            <p className='text-gray-400 text-lg font-medium'>Loading Podcasts...</p>
        </div>
    );
  }

  if (podcastNotes.length === 0) {
    return (
      <div className='relative w-full h-full bg-gray-800 flex items-center justify-center overflow-hidden p-4'>
        <p className='text-gray-400 text-lg font-medium'>No podcasts found for selected authors.</p>
      </div>
    );
  }

  // --- Update Rendering Logic ---
  const displayName = currentProfile?.name || currentProfile?.displayName || currentItem?.posterPubkey?.substring(0, 10) + '...' || 'Unknown';
  const pictureUrl = currentProfile?.picture;
  const isLoadingProfile = currentProfile?.isLoading;

  return (
    <div className='relative w-full h-full bg-gray-900 flex flex-col overflow-hidden p-2 text-white rounded-lg'>
      {/* Updated Top Section with Profile Info */}
       <div className="w-full flex items-center justify-start p-2 mb-4 border-b border-gray-700">
           <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-600 overflow-hidden mr-3">
              {isLoadingProfile ? (
                  <div className="w-full h-full animate-pulse bg-gray-500"></div>
              ) : pictureUrl ? (
                  <img src={pictureUrl} alt={displayName} className="w-full h-full object-cover" onError={() => console.error(`PodcastPlayer: Failed to load image for ${displayName}`)} />
              ) : (
                  <span className="text-gray-300 text-xl font-semibold flex items-center justify-center h-full uppercase">
                      {displayName.substring(0, 1)}
                  </span>
              )}
           </div>
           <div>
              <p className="text-sm font-semibold text-gray-200 truncate" title={displayName}>{displayName}</p>
              <p className="text-xs text-gray-400">Now Playing (Item {currentItemIndex + 1} of {podcastNotes.length})</p>
           </div>
       </div>

      {/* Scrollable Podcast List: Takes up available space */}
      <div className="flex-grow w-full overflow-y-auto pr-1 mb-2"> 
        {podcastNotes.map((note, index) => {
            const isSelected = index === currentItemIndex;
            const itemBg = isSelected ? 'bg-purple-800 bg-opacity-60' : 'bg-gray-700 bg-opacity-50 hover:bg-gray-600 hover:bg-opacity-70';
            const profile = profiles[note.posterPubkey];
            const displayName = profile?.name || profile?.displayName || note.posterPubkey.substring(0, 10) + '...';
            const pictureUrl = profile?.picture;
            const isLoadingProfile = profile?.isLoading;

            // Explicitly return the JSX element for each list item
            return ( 
                <div
                    key={note.id}
                    className={`flex items-center p-2 mb-1 rounded-md cursor-pointer transition-colors ${itemBg}`}
                    onClick={() => setCurrentItemIndex(index)}
                    title={note.content || note.url} 
                >
                    {/* Number Circle */}
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-600 flex items-center justify-center mr-2"> 
                        <span className="text-xs font-semibold text-white">{index + 1}</span>
                    </div>
                    {/* Profile Picture */}
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-500 overflow-hidden mr-2">
                        {isLoadingProfile ? (
                            <div className="w-full h-full animate-pulse bg-gray-400"></div>
                        ) : pictureUrl ? (
                            <img src={pictureUrl} alt={displayName} className="w-full h-full object-cover" onError={() => console.error(`Podcastr: Failed profile img: ${pictureUrl}`)} />
                        ) : (
                            <span className="text-gray-300 text-xs font-semibold flex items-center justify-center h-full uppercase">
                                {displayName.substring(0, 1)}
                            </span>
                        )}
                    </div>
                    {/* Profile Name */}
                    <p className="text-sm text-gray-200 truncate flex-grow" title={displayName}>
                       {displayName} 
                    </p>
                </div>
            );
        })}
      </div>

      {/* Audio Player Controls: Pushed to bottom */}
      <div className="w-full max-w-md p-1 mt-auto bg-black bg-opacity-40 rounded flex-shrink-0 mx-auto"> {/* Use mt-auto to push to bottom */}
        <audio ref={audioRef} controls className="w-full">
            Your browser does not support the audio element.
        </audio>
      </div>

    </div>
  );
};

// Update export name
export default Podcastr; 