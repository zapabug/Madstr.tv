// src/utils/mediaNoteCache.ts
import { openDB, IDBPDatabase, DBSchema } from 'idb';
import { NostrNote } from '../types/nostr';

const DB_NAME = 'MediaNotesCache';
const DB_VERSION = 2;
const STORE_NAME = 'mediaNotes';

// Define the database schema
interface MediaNoteDBSchema extends DBSchema {
    [STORE_NAME]: {
        key: string; // Corresponds to NostrNote 'id'
        value: NostrNote;
        indexes: { 'pubkey': string; 'created_at': number };
    };
}

let dbPromise: Promise<IDBPDatabase<MediaNoteDBSchema>> | null = null;

function getDb(): Promise<IDBPDatabase<MediaNoteDBSchema>> {
    if (!dbPromise) {
        dbPromise = openDB<MediaNoteDBSchema>(DB_NAME, DB_VERSION, {
            upgrade(db: IDBPDatabase<MediaNoteDBSchema>) {
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                    // Add indexes for potential querying
                    store.createIndex('pubkey', 'pubkey', { unique: false });
                    store.createIndex('created_at', 'created_at', { unique: false });
                    // Could add index on mediaType if we store it, or filter post-fetch
                    console.log(`IndexedDB: ${STORE_NAME} object store created.`);
                }
            },
        });
    }
    // We ensure dbPromise is assigned within the if block, so it's safe to return.
    // TypeScript might need an assertion if strict null checks are aggressive.
    // However, the logic guarantees it's a Promise here.
    return dbPromise!;
}

// --- Basic Cache Operations --- 

// Add or update a note in the cache
export async function cacheMediaNote(note: NostrNote): Promise<void> {
    try {
        const db = await getDb();
        await db.put(STORE_NAME, note);
        // console.log(`Cached media note: ${note.id}`);
    } catch (error) {
        console.error("Error caching media note:", error);
    }
}

// Add or update multiple notes
export async function cacheMediaNotes(notes: NostrNote[]): Promise<void> {
    if (notes.length === 0) return;
    try {
        const db = await getDb();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        await Promise.all(notes.map(note => store.put(note)));
        await tx.done;
        // console.log(`Cached ${notes.length} media notes.`);
    } catch (error) {
        console.error("Error bulk caching media notes:", error);
    }
}

// Get a single note by ID (example, might not be used directly by hook)
export async function getCachedMediaNote(id: string): Promise<NostrNote | undefined> {
    try {
        const db = await getDb();
        return await db.get(STORE_NAME, id);
    } catch (error) {
        console.error("Error getting cached media note:", error);
        return undefined;
    }
}

// Get all notes by author (example for potential hook use)
export async function getCachedNotesByAuthors(pubkeys: string[]): Promise<NostrNote[]> {
    if (pubkeys.length === 0) return [];
    try {
        const db = await getDb();
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const index = store.index('pubkey');
        
        // Fetch notes for each pubkey
        const results = await Promise.all(
            pubkeys.map(pk => index.getAll(pk))
        );
        
        // Flatten the array of arrays and remove duplicates (though getAll shouldn't duplicate for a single key)
        const uniqueNotes = new Map<string, NostrNote>();
        results.flat().forEach((note: NostrNote) => {
            if (!uniqueNotes.has(note.id)) {
                uniqueNotes.set(note.id, note);
            }
        });

        return Array.from(uniqueNotes.values());
    } catch (error) {
        console.error("Error getting cached notes by authors:", error);
        return [];
    }
}

// // Future: Add function to prune old notes? 
// export async function pruneOldMediaNotes(maxAgeSeconds: number): Promise<void> {
//     // ... implementation ...
// } 