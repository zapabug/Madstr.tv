import { openDB, DBSchema, IDBPDatabase, StoreNames } from 'idb';

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

// Combine settings types
type SettingsValue = StoredNsecData | StoredFollowedTags;

// --- Database Schema ---
interface MadstrTvAppDB extends DBSchema {
  settings: {
    key: 'currentUserNsec' | 'followedTags'; // Use literal types for keys
    value: SettingsValue;
    indexes: { 'id': 'currentUserNsec' | 'followedTags' };
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
const DB_VERSION = 1;

// --- DB Initialization ---
const getDb = (): Promise<IDBPDatabase<MadstrTvAppDB>> => {
  if (!dbPromise) {
    dbPromise = openDB<MadstrTvAppDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        console.log(`Upgrading DB from version ${oldVersion} to ${DB_VERSION}`);
        if (oldVersion < 1) {
          if (!db.objectStoreNames.contains('settings')) {
            const store = db.createObjectStore('settings', { keyPath: 'id' });
            store.createIndex('id', 'id', { unique: true });
            console.log("Created 'settings' object store.");
          }
          if (!db.objectStoreNames.contains('mediaNoteCache')) {
            const store = db.createObjectStore('mediaNoteCache', { keyPath: 'id' });
            store.createIndex('created_at', 'created_at');
            store.createIndex('pubkey', 'pubkey');
            store.createIndex('kind', 'kind');
            console.log("Created 'mediaNoteCache' object store.");
          }
          if (!db.objectStoreNames.contains('profileCache')) {
            const store = db.createObjectStore('profileCache', { keyPath: 'pubkey' });
            store.createIndex('name', 'name'); // Index by name (optional)
            console.log("Created 'profileCache' object store.");
          }
        }
      },
      blocked: () => console.error("IndexedDB access blocked."),
      blocking: () => console.warn("IndexedDB upgrade blocked."),
      terminated: () => { console.error("IndexedDB connection terminated."); dbPromise = null; }
    });
  }
  return dbPromise;
};

// --- Specific Helper Functions (Recommended Approach) ---

// Settings Store
const getSetting = async (key: MadstrTvAppDB['settings']['key']): Promise<SettingsValue | undefined> => {
    const db = await getDb();
    return db.get('settings', key);
};

const putSetting = async (value: SettingsValue): Promise<MadstrTvAppDB['settings']['key']> => {
    const db = await getDb();
    return db.put('settings', value);
};

const deleteSetting = async (key: MadstrTvAppDB['settings']['key']): Promise<void> => {
    const db = await getDb();
    return db.delete('settings', key);
};

// Media Note Cache Store
const getMediaNote = async (key: string): Promise<NostrNote | undefined> => {
    const db = await getDb();
    return db.get('mediaNoteCache', key);
};

const putMediaNote = async (value: NostrNote): Promise<string> => {
    const db = await getDb();
    // Ensure the value has the 'id' property used as keyPath
    if (!value.id) throw new Error("MediaNote must have an 'id' property for IndexedDB keyPath.");
    return db.put('mediaNoteCache', value);
};

const getAllMediaNotes = async (): Promise<NostrNote[]> => {
    const db = await getDb();
    return db.getAll('mediaNoteCache');
};

const clearMediaNotes = async (): Promise<void> => {
    const db = await getDb();
    return db.clear('mediaNoteCache');
}

// Profile Cache Store
const getProfile = async (key: string): Promise<ProfileData | undefined> => {
    const db = await getDb();
    return db.get('profileCache', key);
};

const putProfile = async (value: ProfileData): Promise<string> => {
    const db = await getDb();
     // Ensure the value has the 'pubkey' property used as keyPath
     if (!value.pubkey) throw new Error("ProfileData must have a 'pubkey' property for IndexedDB keyPath.");
    return db.put('profileCache', value);
};

const getAllProfiles = async (): Promise<ProfileData[]> => {
    const db = await getDb();
    return db.getAll('profileCache');
};

const clearProfiles = async (): Promise<void> => {
    const db = await getDb();
    return db.clear('profileCache');
}


// --- Export ---
export const idb = {
    getDbInstance: getDb,
    // Settings
    getSetting,
    putSetting,
    deleteSetting,
    // Media Notes
    getMediaNote,
    putMediaNote,
    getAllMediaNotes,
    clearMediaNotes,
    // Profiles
    getProfile,
    putProfile,
    getAllProfiles,
    clearProfiles,
};

// --- Initialize ---
getDb().then(() => console.log("IndexedDB initialized successfully."))
       .catch(err => console.error("IndexedDB initialization failed:", err)); 