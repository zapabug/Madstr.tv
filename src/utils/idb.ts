import { openDB, DBSchema, IDBPDatabase, StoreNames } from 'idb';
import { Proof } from '@cashu/cashu-ts';

// --- Database Schema Definition ---
interface AppDbSchema extends DBSchema {
  settings: {
    key: string; // e.g., 'userTheme', 'lastSyncTime', 'configuredMintUrl'
    value: any; // Store various settings types
  };
  cashuProofs: {
    key: string; // Mint URL
    value: Proof[]; // Store an array of proofs associated with the mint URL
  };
  nsec: {
    key: string; // Use a fixed key like 'currentUserNsec'
    value: string; // The encrypted or plain nsec string
  };
  nip46Session: {
    key: string; // e.g., 'currentNip46Session'
    value: StoredNip46Data;
  };
  followedTags: {
    key: string; // e.g., 'userFollowedTags'
    value: string[]; // Array of followed tags
  };
}

// --- Stored Data Type Definitions ---

// Export StoredProof type
export type StoredProof = Proof & { mintUrl: string };

export interface StoredNip46Data {
  id: string; // Fixed key like 'currentNip46Session'
  remoteNpub: string;
  token: string;
  relay?: string; // Optional relay hint
}

// --- Database Initialization and Upgrade Logic ---
const DB_NAME = 'MadTripsDB';
const DB_VERSION = 4; // Increment version number to reflect schema change

let dbPromise: Promise<IDBPDatabase<AppDbSchema>> | null = null;

const getDb = (): Promise<IDBPDatabase<AppDbSchema>> => {
  if (!dbPromise) {
    console.log(`Initializing IndexedDB: ${DB_NAME}, Version: ${DB_VERSION}`);
    dbPromise = openDB<AppDbSchema>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, newVersion, transaction) {
        console.log(`Upgrading DB from version ${oldVersion} to ${newVersion}`);

        // Settings Store (Simple key-value)
        if (oldVersion < 1) {
          console.log("Creating 'settings' object store.");
          db.createObjectStore('settings');
        }

        // Cashu Proofs Store
        if (oldVersion < 2) {
          console.log("Creating 'cashuProofs' object store.");
          db.createObjectStore('cashuProofs'); // Key is mint URL
        }

        // Nsec, NIP46, Tags stores
        if (oldVersion < 3) {
             // Nsec store
             console.log("Creating 'nsec' object store.");
             db.createObjectStore('nsec'); // Fixed key 'currentUserNsec'
             // NIP-46 session store
             console.log("Creating 'nip46Session' object store.");
             db.createObjectStore('nip46Session', { keyPath: 'id' }); // Fixed key 'currentNip46Session'
             // Followed Tags store
             console.log("Creating 'followedTags' object store.");
             db.createObjectStore('followedTags'); // Fixed key 'userFollowedTags'
        }

        // Delete old profileCache store if upgrading from v3
        if (oldVersion === 3 && newVersion === 4) { // Check specific upgrade path
             // Use type assertion for the old store name
             const oldStoreName = 'profileCache' as any;
             if (db.objectStoreNames.contains(oldStoreName)) {
                console.log("Deleting old 'profileCache' object store during upgrade to v4.");
                db.deleteObjectStore(oldStoreName);
             }
        }

        // Add other future upgrades here...
        // if (oldVersion < 5) { ... }
      },
      blocked() {
        console.error('IDB blocked: Another tab might be holding the database open.');
        alert('Database access is blocked. Please close other tabs using this app and refresh.');
      },
      blocking() {
        console.warn('IDB blocking: Database version change blocked by another tab.');
      },
      terminated() {
        console.error('IDB terminated: The browser unexpectedly terminated the connection.');
        dbPromise = null; // Reset promise to allow re-initialization
      },
    });
  }
  return dbPromise;
};

// --- Generic CRUD Operations (Adjusted for stricter types) ---

const get = async <StoreName extends keyof AppDbSchema>(
  storeName: StoreName,
  key: string
): Promise<AppDbSchema[StoreName]['value'] | undefined> => {
  const db = await getDb();
  try {
    // Cast storeName after the check
    if (!db.objectStoreNames.contains(storeName as StoreNames<AppDbSchema>)) {
        console.warn(`Store '${String(storeName)}' does not exist in the current DB schema.`);
        return undefined;
    }
    return await db.get(storeName as StoreNames<AppDbSchema>, key);
  } catch (error) {
    console.error(`Error getting key '${key}' from store '${String(storeName)}':`, error);
    throw error; // Re-throw or handle appropriately
  }
};

const put = async <StoreName extends keyof AppDbSchema>(
  storeName: StoreName,
  value: AppDbSchema[StoreName]['value'],
  key?: string
): Promise<IDBValidKey> => {
  const db = await getDb();
  try {
    // Cast storeName after the check
    if (!db.objectStoreNames.contains(storeName as StoreNames<AppDbSchema>)) {
        console.error(`Store '${String(storeName)}' does not exist. Cannot put value.`);
        throw new Error(`Store '${String(storeName)}' does not exist.`);
    }
    return await db.put(storeName as StoreNames<AppDbSchema>, value, key);
  } catch (error) {
    console.error(`Error putting value into store '${String(storeName)}':`, value, error);
    throw error;
  }
};

const clear = async <StoreName extends keyof AppDbSchema>(
  storeName: StoreName
): Promise<void> => {
  const db = await getDb();
  try {
    // Cast storeName after the check
     if (!db.objectStoreNames.contains(storeName as StoreNames<AppDbSchema>)) {
        console.warn(`Store '${String(storeName)}' does not exist. Cannot clear.`);
        return;
    }
    await db.clear(storeName as StoreNames<AppDbSchema>);
    console.log(`Cleared store: ${String(storeName)}`);
  } catch (error) {
    console.error(`Error clearing store '${String(storeName)}':`, error);
    throw error;
  }
};

const deleteDbEntry = async <StoreName extends keyof AppDbSchema>(
  storeName: StoreName,
  key: string
): Promise<void> => {
  const db = await getDb();
  try {
    // Cast storeName after the check
    if (!db.objectStoreNames.contains(storeName as StoreNames<AppDbSchema>)) {
        console.warn(`Store '${String(storeName)}' does not exist. Cannot delete key '${key}'.`);
        return;
    }
    await db.delete(storeName as StoreNames<AppDbSchema>, key);
    console.log(`Deleted key '${key}' from store '${String(storeName)}'.`);
  } catch (error) {
    console.error(`Error deleting key '${key}' from store '${String(storeName)}':`, error);
    throw error;
  }
};


// --- Specific Helpers for Data Types ---

// Settings
const getSetting = (key: string) => get('settings', key);
const putSetting = (key: string, value: any) => put('settings', value, key);

// Cashu Proofs
const getProofs = (mintUrl: string): Promise<Proof[] | undefined> => get('cashuProofs', mintUrl);

const saveProofs = async (proofsToSave: StoredProof[]): Promise<void> => {
    if (!proofsToSave || proofsToSave.length === 0) {
        console.log("saveProofs: No proofs provided to save.");
        return;
    }
    const db = await getDb();
    const tx = db.transaction('cashuProofs', 'readwrite');
    const store = tx.objectStore('cashuProofs');

    // Group proofs by mintUrl
    const proofsByMint: Record<string, Proof[]> = {};
    proofsToSave.forEach(storedProof => {
        const { mintUrl, ...proof } = storedProof; // Separate mintUrl from Proof fields
        if (!mintUrl) {
            console.warn("saveProofs: Skipping proof with missing mintUrl:", proof);
            return;
        }
        if (!proofsByMint[mintUrl]) {
            proofsByMint[mintUrl] = [];
        }
        proofsByMint[mintUrl].push(proof); // Store only the original Proof structure
    });

    // Fetch existing proofs for the affected mints and merge/overwrite
    const putPromises: Promise<IDBValidKey>[] = [];
    for (const mintUrl in proofsByMint) {
        if (!mintUrl) continue; // Should not happen due to check above, but belt-and-suspenders
        const existingProofs = (await store.get(mintUrl)) || [];
        const newProofsForMint = proofsByMint[mintUrl];
        // Simple merge: Add new proofs to existing ones. Consider deduplication if needed.
        const combinedProofs = [...existingProofs, ...newProofsForMint];
        console.log(`saveProofs: Saving ${newProofsForMint.length} new proofs (total ${combinedProofs.length}) for mint ${mintUrl}`);
        putPromises.push(store.put(combinedProofs, mintUrl));
    }

    await Promise.all(putPromises); // Wait for all puts in the transaction
    await tx.done; // Commit transaction
    console.log(`saveProofs: Finished saving proofs for ${Object.keys(proofsByMint).length} mints.`);
};

const getAllProofs = async (): Promise<StoredProof[]> => {
  const db = await getDb();
  // Use readonly transaction unless write operations are needed inside
  const tx = db.transaction('cashuProofs', 'readonly');
  const store = tx.objectStore('cashuProofs');
  let cursor = await store.openCursor();
  const results: StoredProof[] = [];

  while (cursor) {
    const mintUrl = cursor.key as string;
    const proofsFromMint: Proof[] = cursor.value; // Value is Proof[]
    if (proofsFromMint && Array.isArray(proofsFromMint)) {
        proofsFromMint.forEach(proof => {
             // Add the mintUrl to each proof before adding to results
             results.push({ ...proof, mintUrl });
        });
    }
    cursor = await cursor.continue();
  }

  await tx.done; // Ensure transaction completes
  console.log(`getAllProofs: Returning ${results.length} proofs across all mints.`);
  return results;
};

// Delete proofs by their secret across all mints
const deleteProofsBySecret = async (secretsToDelete: string[]): Promise<void> => {
    if (!secretsToDelete || secretsToDelete.length === 0) {
        console.log("deleteProofsBySecret: No secrets provided for deletion.");
        return;
    }
    const db = await getDb();
    const tx = db.transaction('cashuProofs', 'readwrite');
    const store = tx.objectStore('cashuProofs');
    let cursor = await store.openCursor();
    const deletePromises: Promise<void>[] = []; // For potential entry deletions
    const putPromises: Promise<IDBValidKey>[] = []; // For updates

    const secretsSet = new Set(secretsToDelete); // For efficient lookup

    while (cursor) {
        const mintUrl = cursor.key as string;
        let proofsFromMint: Proof[] = cursor.value;
        const originalLength = proofsFromMint.length;

        if (proofsFromMint && Array.isArray(proofsFromMint)) {
            proofsFromMint = proofsFromMint.filter(proof => !secretsSet.has(proof.secret));
            const removedCount = originalLength - proofsFromMint.length;

            if (removedCount > 0) {
                 console.log(`deleteProofsBySecret: Removed ${removedCount} proofs from mint ${mintUrl}`);
                 if (proofsFromMint.length === 0) {
                     // If no proofs left for this mint, delete the entry
                     console.log(`deleteProofsBySecret: Deleting entry for mint ${mintUrl} as it's now empty.`);
                     deletePromises.push(store.delete(mintUrl));
                 } else {
                     // Otherwise, update the entry with the filtered proofs
                     putPromises.push(store.put(proofsFromMint, mintUrl));
                 }
            }
        }
        cursor = await cursor.continue();
    }

     // Wait for all potential updates/deletions
    await Promise.all([...putPromises, ...deletePromises]);
    await tx.done; // Commit transaction
    console.log(`deleteProofsBySecret: Finished processing ${secretsToDelete.length} secrets.`);
};

const deleteProofs = (mintUrl: string) => deleteDbEntry('cashuProofs', mintUrl);

// Nsec Storage
const NSEC_KEY = 'currentUserNsec';
const loadNsecFromDb = async (): Promise<string | null> => {
    const result = await get('nsec', NSEC_KEY);
    return typeof result === 'string' ? result : null;
};
const saveNsecToDb = (nsec: string) => put('nsec', nsec, NSEC_KEY);
const clearNsecFromDb = () => deleteDbEntry('nsec', NSEC_KEY);

// NIP-46 Session Storage
const NIP46_KEY = 'currentNip46Session';
const loadNip46DataFromDb = async (): Promise<StoredNip46Data | null> => {
    const result = await get('nip46Session', NIP46_KEY);
    // Basic type check
    if (result && typeof result.remoteNpub === 'string' && typeof result.token === 'string') {
        return result as StoredNip46Data;
    }
    return null;
};
const saveNip46DataToDb = (data: Omit<StoredNip46Data, 'id'>) => {
    const storedData: StoredNip46Data = { ...data, id: NIP46_KEY };
    return put('nip46Session', storedData);
};
const clearNip46DataFromDb = () => deleteDbEntry('nip46Session', NIP46_KEY);

// Followed Tags Storage
const FOLLOWED_TAGS_KEY = 'userFollowedTags';
const loadFollowedTagsFromDb = async (): Promise<string[] | null> => {
    const result = await get('followedTags', FOLLOWED_TAGS_KEY);
    return Array.isArray(result) ? result : null;
};
const saveFollowedTagsToDb = (tags: string[]) => put('followedTags', tags, FOLLOWED_TAGS_KEY);
const clearFollowedTagsFromDb = () => deleteDbEntry('followedTags', FOLLOWED_TAGS_KEY);

// --- Specific Mint URL Helpers ---
const MINT_URL_KEY = 'configuredMintUrl';
const loadMintUrlFromDb = async (): Promise<string | null> => {
    const result = await getSetting(MINT_URL_KEY);
    return typeof result === 'string' ? result : null; // Return null if not set or not a string
};
const saveMintUrlToDb = (url: string | null) => putSetting(MINT_URL_KEY, url);

// Export the specific helpers
export const idb = {
    getSetting,
    putSetting,
    // Cashu specific
    getProofs,         // Get proofs for a specific mint
    saveProofs,        // Saves StoredProof[] by grouping
    getAllProofs,      // Gets all proofs across mints as StoredProof[]
    deleteProofs,      // Deletes all proofs for a specific mint
    deleteProofsBySecret, // Deletes specific proofs by secret across all mints
    // Mint URL specific
    loadMintUrlFromDb,
    saveMintUrlToDb,
    // Auth specific
    loadNsecFromDb,
    saveNsecToDb,
    clearNsecFromDb,
    loadNip46DataFromDb,
    saveNip46DataToDb,
    clearNip46DataFromDb,
    // Tags specific
    loadFollowedTagsFromDb,
    saveFollowedTagsToDb,
    clearFollowedTagsFromDb,
};

// --- Initialize ---
getDb().then(() => console.log("IndexedDB initialized successfully."))
       .catch(err => console.error("IndexedDB initialization failed:", err));