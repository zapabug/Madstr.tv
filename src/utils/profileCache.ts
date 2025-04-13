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
const PROFILE_DB_VERSION = 2;
const PROFILE_STORE_NAME = 'profiles';

// Module-level variables for singleton DB connection management
let dbInstance: IDBDatabase | null = null;
let dbOpenPromise: Promise<IDBDatabase> | null = null;
let dbDeleteAttempted = false; // Flag to ensure delete is only attempted once per session/load

// --- Add Function to Delete Database (remains the same) ---
async function deleteProfileDB(): Promise<void> {
    return new Promise((resolve, reject) => {
        console.log(`Attempting to delete IndexedDB: ${PROFILE_DB_NAME}`);
        const deleteRequest = indexedDB.deleteDatabase(PROFILE_DB_NAME);
        deleteRequest.onerror = (event) => {
            console.error(`Error deleting database ${PROFILE_DB_NAME}:`, (event.target as IDBOpenDBRequest).error);
            reject((event.target as IDBOpenDBRequest).error);
        };
        deleteRequest.onsuccess = () => {
            console.log(`Database ${PROFILE_DB_NAME} deleted successfully or did not exist.`);
            resolve();
        };
        deleteRequest.onblocked = () => {
            // This shouldn't usually happen unless another tab has the DB open
            console.warn(`Database ${PROFILE_DB_NAME} deletion blocked. Please close other tabs/instances using this app.`);
            reject(new Error('Database deletion blocked'));
        };
    });
}


// Internal function to handle the actual DB opening and upgrade logic
async function _openAndInitializeDb(): Promise<IDBDatabase> {
    // Attempt deletion only once before the first open attempt
    if (!dbDeleteAttempted) {
        dbDeleteAttempted = true; // Set flag immediately
        try {
            await deleteProfileDB();
        } catch (deleteError) {
            console.error("Database deletion failed, proceeding with open attempt anyway:", deleteError);
            // Decide if you want to reject here or let the open proceed
        }
    }

  return new Promise((resolve, reject) => {
    console.log(`Attempting to open DB: ${PROFILE_DB_NAME} version ${PROFILE_DB_VERSION}`);
    const request = indexedDB.open(PROFILE_DB_NAME, PROFILE_DB_VERSION);

    request.onerror = (event) => {
        console.error(`IndexedDB error opening ${PROFILE_DB_NAME}:`, (event.target as IDBOpenDBRequest).error);
        reject((event.target as IDBOpenDBRequest).error);
    }
    request.onsuccess = (event) => {
        console.log(`IndexedDB ${PROFILE_DB_NAME} opened successfully.`);
        resolve((event.target as IDBOpenDBRequest).result);
    }
    request.onupgradeneeded = (event) => {
      console.log(`Upgrading IndexedDB ${PROFILE_DB_NAME} to version ${PROFILE_DB_VERSION}`);
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(PROFILE_STORE_NAME)) {
         console.log(`Creating object store: ${PROFILE_STORE_NAME}`);
         try {
            db.createObjectStore(PROFILE_STORE_NAME, { keyPath: 'pubkey' });
            console.log(`Object store ${PROFILE_STORE_NAME} created successfully.`);
         } catch (e) {
             console.error(`Error creating object store ${PROFILE_STORE_NAME}:`, e);
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
          console.log(`Object store ${PROFILE_STORE_NAME} already exists.`);
      }
    };
  });
}

// Singleton getter for the DB instance
function getDbInstance(): Promise<IDBDatabase> {
    if (dbInstance) {
        // If instance exists, return it immediately
        return Promise.resolve(dbInstance);
    }
    if (dbOpenPromise) {
        // If an open operation is already in progress, return its promise
        return dbOpenPromise;
    }
    // Otherwise, initiate the open operation
    console.log("Initiating new DB connection promise.");
    dbOpenPromise = _openAndInitializeDb();

    dbOpenPromise
        .then(db => {
            console.log("DB connection promise resolved successfully.");
            dbInstance = db; // Cache the instance
            dbOpenPromise = null; // Clear the promise
            // Optional: Add handler for database closing unexpectedly
            dbInstance.onclose = () => {
                console.warn(`IndexedDB ${PROFILE_DB_NAME} connection closed unexpectedly.`);
                dbInstance = null; // Reset instance if connection closes
            };
            return db;
        })
        .catch(err => {
            console.error("DB connection promise failed:", err);
            dbOpenPromise = null; // Clear the promise on failure
            // Propagate the error
            throw err;
        });

    return dbOpenPromise;
}


export async function saveProfileToCache(profile: ProfileData): Promise<void> {
  const db = await getDbInstance(); // Use singleton getter
  return new Promise((resolve, reject) => {
    if (!db) { // Add check for safety, although getDbInstance should handle errors
        reject(new Error("Database connection not available for saving profile."));
        return;
    }
    const transaction = db.transaction([PROFILE_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(PROFILE_STORE_NAME);
    // Ensure cachedAt is set before putting
    const profileWithTimestamp = { ...profile, cachedAt: Date.now() };
    // console.log("Saving profile to cache:", profileWithTimestamp.pubkey); // Reduce log verbosity
    store.put(profileWithTimestamp);
    transaction.oncomplete = () => resolve();
    transaction.onerror = (event) => {
        console.error("Error saving profile to cache:", (event.target as IDBRequest).error);
        reject((event.target as IDBRequest).error);
    }
  });
}

export async function getProfileFromCache(pubkey: string): Promise<ProfileData | null> {
  const db = await getDbInstance(); // Use singleton getter
  return new Promise((resolve, reject) => {
     if (!db) {
        reject(new Error("Database connection not available for getting profile."));
        return;
    }
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
  const db = await getDbInstance(); // Use singleton getter
  return new Promise((resolve, reject) => {
     if (!db) {
        reject(new Error("Database connection not available for getting all profiles."));
        return;
    }
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
  const db = await getDbInstance(); // Use singleton getter
  // No need to call getAllProfilesFromCache here, do it inside the transaction
  return new Promise((resolve, reject) => {
     if (!db) {
        reject(new Error("Database connection not available for deleting expired profiles."));
        return;
    }
    const transaction = db.transaction([PROFILE_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(PROFILE_STORE_NAME);
    const now = Date.now();
    const expiredPubkeys: string[] = [];

    // Use a cursor to iterate and delete efficiently
    const cursorRequest = store.openCursor();
    cursorRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
            const profile: ProfileData = cursor.value;
            if (!profile.cachedAt || (now - profile.cachedAt > expirationTimeMs)) {
                expiredPubkeys.push(profile.pubkey);
                cursor.delete(); // Delete the record directly
            }
            cursor.continue();
        } else {
            // End of cursor iteration
             if (expiredPubkeys.length > 0) {
                console.log("Deleting expired profiles:", expiredPubkeys);
            }
        }
    };
    cursorRequest.onerror = (event) => {
         console.error("Error iterating profiles for deletion:", (event.target as IDBRequest).error);
         reject((event.target as IDBRequest).error);
    };

    // Transaction completion handles resolve/reject
    transaction.oncomplete = () => resolve();
    transaction.onerror = (event) => {
        // Cursor error might have already rejected, but this catches transaction-level errors
        if (!(event.target as IDBTransaction).error) { // Avoid duplicate console logs if cursor already failed
             console.error("Error during expired profile deletion transaction:", (event.target as IDBTransaction).error);
        }
        reject((event.target as IDBTransaction).error ?? new Error("Expired profile deletion transaction failed"));
    };
  });
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