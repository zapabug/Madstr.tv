import { openDB, DBSchema, IDBPDatabase } from 'idb';

// --- Type Definitions ---
// Define more specific types if possible
export type NostrNote = {
    id: string;
    pubkey: string;
    created_at: number;
    kind: number;
    tags: string[][];
    content: string;
    sig: string;
    // Add other relevant fields from your actual NostrNote structure
    imageUrl?: string;
    videoUrl?: string;
    podcastUrl?: string;
    podcastTitle?: string;
};

export type ProfileData = {
    pubkey: string; // Ensure pubkey is part of the object for keyPath
    name?: string;
    display_name?: string;
    picture?: string;
    banner?: string;
    about?: string;
    website?: string;
    lud16?: string; // Lightning address NIP-05
    nip05?: string; // NIP-05 identifier
    // Add other Kind 0 fields as needed
};

export interface StoredNsecData {
    id: 'currentUserNsec'; // Use literal type for the key
    nsec: string;
}

export interface StoredFollowedTags {
    id: 'followedTags'; // Use literal type for the key
    tags: string[];
}

export interface StoredVideoTags {
    id: 'videoTags';
    tags: string[];
}

export interface StoredImageFiltering {
    id: 'fetchImagesByTagEnabled';
    value: boolean;
}

export interface StoredVideoFiltering {
    id: 'fetchVideosByTagEnabled';
    value: boolean;
}

export interface StoredMusicFiltering {
    id: 'fetchMusicByTagEnabled';
    value: boolean;
}

export interface StoredMusicTags {
    id: 'musicTags';
    tags: string[];
}

export interface StoredNip46Session {
    id: 'nip46Session';
    payload: string;
}

export interface StoredSeenNotes {
    id: 'seenNotes';
    noteIds: string[];
    lastUpdated: number;
}

// Use basic Proof type and add mintUrl in helpers if needed
// export interface StoredProof extends Proof {
//     id: string; // Concatenation of secret + C ? Or just use 'secret'? 'secret' should be unique per mint.
//     mintUrl: string; // To group proofs by mint
// }

// Combine settings types
type SettingsValue = StoredNsecData | StoredFollowedTags | StoredVideoTags | StoredImageFiltering | StoredVideoFiltering | StoredMusicFiltering | StoredMusicTags | StoredNip46Session | StoredSeenNotes;

// --- Database Schema ---
interface MadstrTvAppDB extends DBSchema {
  settings: {
    key: 'currentUserNsec' | 'followedTags' | 'videoTags' | 'fetchImagesByTagEnabled' | 'fetchVideosByTagEnabled' | 'fetchMusicByTagEnabled' | 'musicTags' | 'nip46Session' | 'seenNotes';
    value: SettingsValue;
    indexes: { 'id': 'currentUserNsec' | 'followedTags' | 'videoTags' | 'fetchImagesByTagEnabled' | 'fetchVideosByTagEnabled' | 'fetchMusicByTagEnabled' | 'musicTags' | 'nip46Session' | 'seenNotes' };
  };
  mediaNoteCache: {
    key: string; // note ID (hex)
    value: NostrNote;
    indexes: { 'created_at': number; 'pubkey': string; 'kind': number };
  };
  profileCache: {
    key: string; // pubkey hex
    value: ProfileData;
    indexes: { 'name': string };
  };
}

let dbPromise: Promise<IDBPDatabase<MadstrTvAppDB>> | null = null;
const DB_NAME = 'MadstrTvAppDB';
const DB_VERSION = 7;

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
    dbPromise = openDB<MadstrTvAppDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, newVersion) {
        console.log(`Upgrading DB from version ${oldVersion} to ${newVersion}`);

        // Settings Store (Simple key-value)
        if (oldVersion < 1) {
          console.log("Creating 'settings' object store.");
          db.createObjectStore('settings');
        }
        
        // Add blocks for future versions here

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

    saveVideoTagsToDb: async (tags: string[]): Promise<void> => {
        await idb.putSetting({ id: 'videoTags', tags });
    },

    loadVideoTagsFromDb: async (): Promise<string[]> => {
        const setting = await idb.getSetting('videoTags');
        return setting && 'tags' in setting ? setting.tags : [];
    },

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

    getAllMediaNotes: async (): Promise<NostrNote[]> => {
        const db = await getDb();
        return db.getAll('mediaNoteCache');
    },

    clearMediaNotes: async (): Promise<void> => {
        const db = await getDb();
        return db.clear('mediaNoteCache');
    },

    // --- Profile Cache Helpers ---
    getProfile: async (key: string): Promise<ProfileData | undefined> => {
        const db = await getDb();
        return db.get('profileCache', key);
    },

    putProfile: async (value: ProfileData): Promise<string> => {
        const db = await getDb();
        if (!value.pubkey) throw new Error("ProfileData must have a 'pubkey' property for IndexedDB keyPath.");
        return db.put('profileCache', value);
    },

    getAllProfiles: async (): Promise<ProfileData[]> => {
        const db = await getDb();
        return db.getAll('profileCache');
    },

    clearProfiles: async (): Promise<void> => {
        const db = await getDb();
        return db.clear('profileCache');
    },

    // --- Seen Notes Helpers ---
    getSeenNotes: async (): Promise<Set<string>> => {
        const setting = await idb.getSetting('seenNotes');
        if (setting && 'noteIds' in setting) {
            return new Set(setting.noteIds);
        }
        return new Set();
    },

    markNoteAsSeen: async (noteId: string): Promise<void> => {
        const current = await idb.getSeenNotes();
        current.add(noteId);
        // Keep max 1000 seen notes
        const noteIds = Array.from(current);
        if (noteIds.length > 1000) {
            noteIds.splice(0, noteIds.length - 1000);
        }
        await idb.putSetting({
            id: 'seenNotes',
            noteIds,
            lastUpdated: Date.now(),
        });
    },

    isNoteSeen: async (noteId: string): Promise<boolean> => {
        const seenNotes = await idb.getSeenNotes();
        return seenNotes.has(noteId);
    },

    clearSeenNotes: async (): Promise<void> => {
        await idb.deleteSetting('seenNotes');
    },
};

// --- Initialize ---
getDb().then(() => console.log("IndexedDB initialized successfully."))
       .catch(err => console.error("IndexedDB initialization failed:", err));