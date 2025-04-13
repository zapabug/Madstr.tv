import { useState, useEffect, useRef } from 'react';
import { useNdk } from 'nostr-hooks';
import { NDKEvent, NDKFilter, NDKKind, NDKSubscription } from '@nostr-dev-kit/ndk';

// --- Interfaces & Types ---
interface PodcastNote {
  id: string; 
  eventId: string;
  type: 'podcast';
  url: string;
  posterPubkey: string;
  createdAt: number;
  content?: string;
}

// --- Constants ---
const PODCAST_NOTE_DB_NAME = 'PodcastNoteCache';
const PODCAST_NOTE_DB_VERSION = 1;
const PODCAST_NOTE_STORE_NAME = 'podcastNotes';
const podcastUrlRegex = /https?:\/\S+\.(?:mp3|m4a|wav)/gi;
const MAX_NOTES_TO_STORE = 50;

// --- IndexedDB Helper Functions ---
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
        notes.forEach(note => store.put(note)); // put will overwrite existing notes with the same id if needed
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
            // Sort descending by createdAt and limit
            notes.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
            resolve(notes.slice(0, MAX_NOTES_TO_STORE));
        };
        request.onerror = () => reject(request.error);
    });
}

// --- Utility Functions ---
function getMediaType(url: string): 'podcast' | null {
  const extension = url.split('.').pop()?.toLowerCase();
  if (!extension) return null;
  if (['mp3', 'm4a', 'wav'].includes(extension)) {
    return 'podcast';
  }
  return null;
}

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
          // Check if we already have this specific podcast instance
          if (!notesByIdMap.has(mediaItemId)) {
            const newNote: PodcastNote = {
              id: mediaItemId,
              eventId: event.id,
              type: mediaType,
              url: url,
              posterPubkey: posterPubkey,
              createdAt: event.created_at ?? Math.floor(Date.now() / 1000),
              content: content, // Include content for potential display/title
            };
            notesByIdMap.set(mediaItemId, newNote); // Add to map immediately
            newNotes.push(newNote);
          }
        }
      });
    }
  });
  // No need to sort here, sorting happens when combining with cache/state
  return newNotes;
};

// --- The Hook ---
interface UsePodcastNotesResult {
  notes: PodcastNote[];
  isLoading: boolean;
}

export function usePodcastNotes(authors: string[]): UsePodcastNotesResult {
  const { ndk } = useNdk();
  const [notes, setNotes] = useState<PodcastNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const notesById = useRef<Map<string, PodcastNote>>(new Map());
  const currentSubscription = useRef<NDKSubscription | null>(null);

  // Load initial notes from cache
  useEffect(() => {
    setIsLoading(true);
    getPodcastNotesFromCache()
      .then(cachedNotes => {
        console.log(`usePodcastNotes: Loaded ${cachedNotes.length} notes from cache.`);
        notesById.current = new Map(cachedNotes.map(note => [note.id, note]));
        setNotes(cachedNotes);
        setIsLoading(false);
      })
      .catch(err => {
        console.error('usePodcastNotes: Failed to load notes from cache:', err);
        setIsLoading(false); // Still finish loading even if cache fails
      });
  }, []); // Run only once on mount

  // Subscribe to NDK for new notes
  useEffect(() => {
    // Stop previous subscription if authors change
    if (currentSubscription.current) {
      console.log("usePodcastNotes: Stopping previous subscription.");
      currentSubscription.current.stop();
      currentSubscription.current = null;
    }

    if (!ndk || authors.length === 0 || isLoading) { // Wait for cache loading to finish
      // If authors clear, clear notes
      if (authors.length === 0) {
          setNotes([]);
          notesById.current.clear();
      }
      return;
    }

    console.log(`usePodcastNotes: Subscribing for ${authors.length} authors...`);
    const filter: NDKFilter = {
      kinds: [NDKKind.Text],
      authors: authors,
      limit: MAX_NOTES_TO_STORE, // Fetch a decent number initially
    };

    const subscription = ndk.subscribe(filter, { closeOnEose: false });
    currentSubscription.current = subscription; // Store current subscription

    subscription.on('event', (event: NDKEvent) => {
        const newFoundNotes = processEventsIntoPodcastNotes([event], notesById.current);
        if (newFoundNotes.length > 0) {
          console.log(`usePodcastNotes: Processing ${newFoundNotes.length} new notes from subscription.`);
          // Add new notes and re-sort/limit
          setNotes(prevNotes => {
            const combined = [...newFoundNotes, ...prevNotes];
            combined.sort((a, b) => b.createdAt - a.createdAt);
            const limited = combined.slice(0, MAX_NOTES_TO_STORE);
            // Update the map as well for future duplicate checks
            limited.forEach(n => notesById.current.set(n.id, n));
            // Persist new notes to cache (fire and forget)
            savePodcastNotesToCache(newFoundNotes).catch(err => console.error('usePodcastNotes: Failed to save new notes to cache:', err));
            return limited;
          });
        }
    });

    subscription.on('eose', () => { 
        console.log("usePodcastNotes: Subscription EOSE."); 
        // Potentially set loading to false here if needed, but cache loading handles initial state
    });

    subscription.start();

    // Cleanup function
    return () => {
        if (subscription) {
            console.log("usePodcastNotes: Cleaning up subscription.");
            subscription.stop();
            currentSubscription.current = null;
        }
    };
  }, [ndk, authors, isLoading]); // Depend on authors and NDK instance, and wait for loading

  return { notes, isLoading };
} 