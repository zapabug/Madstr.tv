import { openDB, DBSchema, IDBPDatabase, StoreNames } from 'idb';
import { Proof } from '@cashu/cashu-ts'; // Import Proof type

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

// Add interface for Mint URL setting
export interface StoredMintUrl {
    id: 'mintUrl'; // Use literal type for the key
    url: string;
}

// Use basic Proof type and add mintUrl in helpers if needed
// export interface StoredProof extends Proof {
//     id: string; // Concatenation of secret + C ? Or just use 'secret'? 'secret' should be unique per mint.
//     mintUrl: string; // To group proofs by mint
// }

// Combine settings types
type SettingsValue = StoredNsecData | StoredFollowedTags | StoredMintUrl;

// --- Database Schema ---
interface MadstrTvAppDB extends DBSchema {
  settings: {
    key: 'currentUserNsec' | 'followedTags' | 'mintUrl'; // Use literal types for keys
    value: SettingsValue;
    indexes: { 'id': 'currentUserNsec' | 'followedTags' | 'mintUrl' };
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
  cashuProofs: {
    key: string; // Proof 'secret'
    value: Proof & { mintUrl: string }; // Store basic Proof plus mintUrl
    indexes: { 'mintUrl': string; 'amount': number }; // Index by mint and amount for easier lookup/selection
  };
}

let dbPromise: Promise<IDBPDatabase<MadstrTvAppDB>> | null = null;
const DB_NAME = 'MadstrTvAppDB';
const DB_VERSION = 5;

// --- DB Initialization ---
const getDb = (): Promise<IDBPDatabase<MadstrTvAppDB>> => {
  if (!dbPromise) {
    dbPromise = openDB<MadstrTvAppDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, newVersion, transaction) {
        console.log(`Upgrading DB from version ${oldVersion} to ${newVersion}`);
        
        // Logic for version 1 creation (settings, media, profile)
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

        // Logic for version 2 creation (cashuProofs)
        if (oldVersion < 2) {
          // Add cashuProofs store if it doesn't already exist
          if (!db.objectStoreNames.contains('cashuProofs')) {
            const store = db.createObjectStore('cashuProofs', { keyPath: 'secret' }); // Use 'secret' as the primary key
            store.createIndex('mintUrl', 'mintUrl'); // Index by mint URL
            store.createIndex('amount', 'amount'); // Index by amount
            console.log("Created 'cashuProofs' object store (v2 upgrade).");
          } else {
            console.log("'cashuProofs' object store already exists (v2 check).");
            // If the store exists but needs index changes, do it here using the transaction
            // Example: 
            // const proofStore = transaction.objectStore('cashuProofs');
            // if (!proofStore.indexNames.contains('newIndex')) {
            //   proofStore.createIndex('newIndex', 'someProperty');
            //   console.log("Added 'newIndex' to 'cashuProofs'.");
            // }
          }
        }
        
        // Add blocks for future versions here (e.g., if (oldVersion < 3) { ... })

      },
      blocked: () => console.error("IndexedDB access blocked."),
      blocking: () => console.warn("IndexedDB upgrade blocked."),
      terminated: () => { console.error("IndexedDB connection terminated."); dbPromise = null; }
    });
  }
  return dbPromise;
};

// --- Export consolidated object containing ALL helpers ---
export const idb = {
    getDbInstance: getDb,

    // --- Settings Store Basic Helpers ---
    getSetting: async (key: MadstrTvAppDB['settings']['key']): Promise<SettingsValue | undefined> => {
        const db = await getDb();
        return db.get('settings', key);
    },

    putSetting: async (value: SettingsValue): Promise<MadstrTvAppDB['settings']['key']> => {
        const db = await getDb();
        return db.put('settings', value);
    },

    deleteSetting: async (key: MadstrTvAppDB['settings']['key']): Promise<void> => {
        const db = await getDb();
        return db.delete('settings', key);
    },

    // --- Specific Settings Helpers ---
    saveNsecToDb: async (nsec: string): Promise<void> => {
        // Use 'this' to refer to other methods within the idb object
        await idb.putSetting({ id: 'currentUserNsec', nsec });
    },

    loadNsecFromDb: async (): Promise<string | null> => {
        const setting = await idb.getSetting('currentUserNsec');
        return setting && 'nsec' in setting ? setting.nsec : null;
    },

    clearNsecFromDb: async (): Promise<void> => {
        await idb.deleteSetting('currentUserNsec');
    },

    saveFollowedTagsToDb: async (tags: string[]): Promise<void> => {
        await idb.putSetting({ id: 'followedTags', tags });
    },

    loadFollowedTagsFromDb: async (): Promise<string[]> => {
        const setting = await idb.getSetting('followedTags');
        return setting && 'tags' in setting ? setting.tags : [];
    },

    saveMintUrlToDb: async (mintUrl: string): Promise<void> => {
        if (!mintUrl) {
            console.warn("Attempted to save an empty mint URL. Deleting setting instead.");
            await idb.deleteSetting('mintUrl');
            return;
        }
        try {
            new URL(mintUrl);
        } catch (e) {
            console.error("Invalid Mint URL provided:", mintUrl, e);
            throw new Error("Invalid Mint URL format.");
        }
        await idb.putSetting({ id: 'mintUrl', url: mintUrl });
    },

    loadMintUrlFromDb: async (): Promise<string | null> => {
        const setting = await idb.getSetting('mintUrl');
        if (setting && typeof setting === 'object' && 'id' in setting && setting.id === 'mintUrl' && 'url' in setting) {
            return setting.url;
        }
        return null;
    },

    // --- Media Note Cache Helpers ---
    getMediaNote: async (key: string): Promise<NostrNote | undefined> => {
        const db = await getDb();
        return db.get('mediaNoteCache', key);
    },

    putMediaNote: async (value: NostrNote): Promise<string> => {
        const db = await getDb();
        if (!value.id) throw new Error("MediaNote must have an 'id' property for IndexedDB keyPath.");
        return db.put('mediaNoteCache', value);
    },

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

    // --- Cashu Proofs Store Helpers ---
    addProofs: async (proofs: Proof[], mintUrl: string): Promise<void> => {
        const db = await getDb();
        const tx = db.transaction('cashuProofs', 'readwrite');
        const store = tx.objectStore('cashuProofs');
        const promises = proofs.map(proof => {
            const storedProof = { ...proof, mintUrl: mintUrl }; // Add mintUrl here
            return store.put(storedProof);
        });
        await Promise.all(promises);
        await tx.done;
        console.log(`Added ${proofs.length} proofs for mint ${mintUrl} to IndexedDB.`);
    },

    getProofsByMint: async (mintUrl: string): Promise<(Proof & { mintUrl: string })[]> => {
        const db = await getDb();
        return db.getAllFromIndex('cashuProofs', 'mintUrl', mintUrl);
    },

    getAllProofs: async (): Promise<(Proof & { mintUrl: string })[]> => {
        const db = await getDb();
        return db.getAll('cashuProofs');
    },

    removeProofs: async (proofsToRemove: Proof[]): Promise<void> => {
        if (!proofsToRemove || proofsToRemove.length === 0) return;
        const db = await getDb();
        const tx = db.transaction('cashuProofs', 'readwrite');
        const store = tx.objectStore('cashuProofs');
        const secretsToRemove = proofsToRemove.map(p => p.secret);
        const promises = secretsToRemove.map(secret => store.delete(secret));
        await Promise.all(promises);
        await tx.done;
        console.log(`Removed ${proofsToRemove.length} proofs from IndexedDB.`);
    },

    clearProofs: async (): Promise<void> => {
        const db = await getDb();
        return db.clear('cashuProofs');
    },
};

// --- Initialize ---
getDb().then(() => console.log("IndexedDB initialized successfully."))
       .catch(err => console.error("IndexedDB initialization failed:", err)); 