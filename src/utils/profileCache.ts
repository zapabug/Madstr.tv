import { NDKUserProfile } from '@nostr-dev-kit/ndk';

// Interface for storing profile data in cache and state
export interface ProfileData {
  pubkey: string; // Ensure pubkey is part of the main data
  name?: string;
  picture?: string;
  displayName?: string; // Add other potential fields if needed
  about?: string;
  banner?: string;
  lud16?: string;
  nip05?: string;
  // Add other fields from NDKUserProfile as needed
  cachedAt?: number; // Timestamp for cache management
  isLoading?: boolean; // Optional: Track loading state in component state
}


// IndexedDB setup for caching profile metadata
const PROFILE_DB_NAME = 'ProfileCache'; // Unified DB Name
const PROFILE_DB_VERSION = 1;
const PROFILE_STORE_NAME = 'profiles';

async function openProfileDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PROFILE_DB_NAME, PROFILE_DB_VERSION);
    request.onerror = (event) => reject((event.target as IDBOpenDBRequest).error);
    request.onsuccess = (event) => resolve((event.target as IDBOpenDBRequest).result);
    request.onupgradeneeded = (event) => {
      console.log("Upgrading ProfileCache DB...");
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(PROFILE_STORE_NAME)) {
         console.log(`Creating ${PROFILE_STORE_NAME} object store...`);
         db.createObjectStore(PROFILE_STORE_NAME, { keyPath: 'pubkey' });
      }
    };
  });
}

export async function saveProfileToCache(profile: ProfileData): Promise<void> {
  const db = await openProfileDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([PROFILE_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(PROFILE_STORE_NAME);
    // Ensure cachedAt is set before putting
    const profileWithTimestamp = { ...profile, cachedAt: Date.now() }; 
    console.log("Saving profile to cache:", profileWithTimestamp.pubkey);
    store.put(profileWithTimestamp);
    transaction.oncomplete = () => resolve();
    transaction.onerror = (event) => {
        console.error("Error saving profile to cache:", (event.target as IDBRequest).error);
        reject((event.target as IDBRequest).error);
    }
  });
}

export async function getProfileFromCache(pubkey: string): Promise<ProfileData | null> {
  const db = await openProfileDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([PROFILE_STORE_NAME], 'readonly');
    const store = transaction.objectStore(PROFILE_STORE_NAME);
    const request = store.get(pubkey);
    request.onsuccess = () => {
      // console.log("Got profile from cache:", request.result?.pubkey);
      resolve(request.result as ProfileData | null);
    };
    request.onerror = (event) => {
        console.error("Error getting profile from cache:", (event.target as IDBRequest).error);
        reject((event.target as IDBRequest).error);
    }
  });
}

// Gets *all* profiles, mainly for potential cleanup or bulk operations
export async function getAllProfilesFromCache(): Promise<ProfileData[]> {
  const db = await openProfileDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([PROFILE_STORE_NAME], 'readonly');
    const store = transaction.objectStore(PROFILE_STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => {
      resolve((request.result as ProfileData[]) || []);
    };
     request.onerror = (event) => {
        console.error("Error getting all profiles from cache:", (event.target as IDBRequest).error);
        reject((event.target as IDBRequest).error);
    }
  });
}

// Optional: Function to delete expired profiles
export async function deleteExpiredProfilesFromCache(expirationTimeMs: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
  const db = await openProfileDB();
  const allProfiles = await getAllProfilesFromCache(); // Reuse getAll
  const now = Date.now();
  const expiredPubkeys = allProfiles
    .filter(profile => !profile.cachedAt || (now - profile.cachedAt > expirationTimeMs))
    .map(profile => profile.pubkey);

  if (expiredPubkeys.length > 0) {
    console.log("Deleting expired profiles:", expiredPubkeys);
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([PROFILE_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(PROFILE_STORE_NAME);
      expiredPubkeys.forEach(pubkey => store.delete(pubkey));
      transaction.oncomplete = () => resolve();
      transaction.onerror = (event) => {
        console.error("Error deleting expired profiles:", (event.target as IDBRequest).error);
        reject((event.target as IDBRequest).error);
      }
    });
  } else {
    return Promise.resolve();
  }
}

// Helper to parse NDKEvent content into our ProfileData structure
export function parseProfileContent(contentString: string, pubkey: string): Omit<ProfileData, 'cachedAt' | 'isLoading'> | null {
    try {
        const profileEventData: Partial<NDKUserProfile> = JSON.parse(contentString);
        // Map NDKUserProfile fields to our ProfileData structure
        return {
            pubkey: pubkey,
            name: profileEventData.name,
            picture: profileEventData.picture,
            displayName: profileEventData.displayName,
            about: profileEventData.about,
            banner: profileEventData.banner,
            lud16: profileEventData.lud16,
            nip05: profileEventData.nip05,
            // Add other fields as needed
        };
    } catch (error) {
        console.error(`Error parsing profile content for ${pubkey}:`, error);
        return null;
    }
} 