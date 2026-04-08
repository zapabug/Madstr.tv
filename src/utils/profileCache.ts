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

// Internal function to handle the actual DB opening and upgrade logic
async function _openAndInitializeDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    console.log(`Attempting to open DB: ${PROFILE_DB_NAME} version ${PROFILE_DB_VERSION}`);
    const request = indexedDB.open(PROFILE_DB_NAME, PROFILE_DB_VERSION);

    request.onerror = (event) => {
        console.error(`IndexedDB error opening ${PROFILE_DB_NAME}:`, (event.target as IDBOpenDBRequest).error);
        dbOpenPromise = null; // Reset promise on error
        reject((event.target as IDBOpenDBRequest).error);
    }
    request.onsuccess = (event) => {
        console.log(`IndexedDB ${PROFILE_DB_NAME} opened successfully.`);
        const db = (event.target as IDBOpenDBRequest).result;
        resolve(db);
    }
    request.onupgradeneeded = (event) => {
      console.log(`Upgrading IndexedDB ${PROFILE_DB_NAME} to version ${PROFILE_DB_VERSION}`);
      const db = (event.target as IDBOpenDBRequest).result;
      const transaction = (event.target as IDBOpenDBRequest).transaction;
      if (!transaction) {
          console.error("Upgrade needed but no transaction found!");
          return; 
      }
      if (!db.objectStoreNames.contains(PROFILE_STORE_NAME)) {
          console.log(`Creating object store: ${PROFILE_STORE_NAME}`);
          try {
              db.createObjectStore(PROFILE_STORE_NAME, { keyPath: 'pubkey' });
              console.log(`Object store ${PROFILE_STORE_NAME} creation initiated.`);
          } catch (e) {
              console.error(`Error creating object store ${PROFILE_STORE_NAME}:`, e);
              try { transaction.abort(); } catch (abortError) { console.error("Error aborting transaction after failed store creation:", abortError); }
              return;
          }
      } else {
          console.log(`Object store ${PROFILE_STORE_NAME} already exists.`);
      }
      transaction.oncomplete = () => {
          console.log("DB upgrade transaction completed.");
      };
      transaction.onerror = (event) => {
          console.error("Error during DB upgrade transaction:", (event.target as IDBTransaction).error);
      };
    };
  });
}

// Singleton getter for the DB instance
function getDbInstance(): Promise<IDBDatabase> {
    console.log("getDbInstance called."); // Add log
    if (dbInstance) {
        console.log("Returning existing dbInstance."); // Add log
        return Promise.resolve(dbInstance);
    }
    if (dbOpenPromise) {
        console.log("Returning existing dbOpenPromise."); // Add log
        return dbOpenPromise;
    }

    console.log("Initiating new DB connection promise (_openAndInitializeDb)..."); // Add log
    dbOpenPromise = _openAndInitializeDb()
        .then(db => {
            console.log("DB connection promise resolved successfully. Caching instance."); // Add log
            dbInstance = db;
            dbOpenPromise = null;
            dbInstance.onclose = () => {
                console.warn(`IndexedDB ${PROFILE_DB_NAME} connection closed unexpectedly.`);
                dbInstance = null;
            };
            return db;
        })
        .catch(err => {
            console.error("DB connection promise CATCH block executed:", err); // Add log
            dbOpenPromise = null;
            throw err;
        });

    console.log("Returning newly created dbOpenPromise."); // Add log
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
  console.log(`getProfileFromCache: called for ${pubkey.substring(0,8)}`); // Add log
  const db = await getDbInstance(); 
  console.log(`getProfileFromCache: awaited getDbInstance for ${pubkey.substring(0,8)}`); // Add log
  return new Promise((resolve, reject) => {
     if (!db) {
        console.error(`getProfileFromCache: DB instance is null/undefined for ${pubkey.substring(0,8)}`); // Add log
        reject(new Error("Database connection not available for getting profile."));
        return;
     }
     console.log(`getProfileFromCache: Creating transaction for ${pubkey.substring(0,8)}`); // Add log
     let transaction: IDBTransaction;
     try {
       transaction = db.transaction([PROFILE_STORE_NAME], 'readonly');
     } catch (e) {
        console.error(`getProfileFromCache: Error creating transaction for ${pubkey.substring(0,8)}:`, e); // Add log
        reject(e);
        return;
     }
     const store = transaction.objectStore(PROFILE_STORE_NAME);
     console.log(`getProfileFromCache: Requesting get(${pubkey.substring(0,8)}) from store`); // Add log
     const request = store.get(pubkey);
     
     request.onsuccess = () => {
       console.log(`getProfileFromCache: store.get SUCCESS for ${pubkey.substring(0,8)}. Result:`, request.result); // Add log
       resolve(request.result as ProfileData | null);
     };
     request.onerror = (event) => {
        console.error(`getProfileFromCache: store.get ERROR for ${pubkey.substring(0,8)}:`, (event.target as IDBRequest).error); // Add log
        reject((event.target as IDBRequest).error);
     };
     
     transaction.oncomplete = () => {
         console.log(`getProfileFromCache: Transaction completed for ${pubkey.substring(0,8)}.`); // Add log
     };
     transaction.onerror = (event) => {
         console.error(`getProfileFromCache: Transaction error for ${pubkey.substring(0,8)}:`, (event.target as IDBTransaction).error); // Add log
         // Reject might have already happened via request.onerror
     };
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