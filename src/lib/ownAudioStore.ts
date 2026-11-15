import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

// Minimal File System Access API shapes (not all of them are in lib.dom).
export interface FsFileHandle {
  kind: 'file';
  name: string;
  getFile(): Promise<File>;
}

export interface FsDirHandle {
  kind: 'directory';
  name: string;
  values(): AsyncIterable<FsFileHandle | FsDirHandle>;
  queryPermission?(_descriptor: { mode: 'read' }): Promise<PermissionState>;
  requestPermission?(_descriptor: { mode: 'read' }): Promise<PermissionState>;
}

export interface StoredFolder {
  id: string;
  name: string;
  handle?: FsDirHandle; // web: File System Access handle
  uri?: string; // Android app: the folder's content:// tree uri (spec feat-android-native §N2)
  kind?: 'audio' | 'image'; // folders saved before pictures existed are audio
}

export interface StoredFeed {
  url: string;
  name: string;
  addedAt: number;
}

interface OwnAudioDB extends DBSchema {
  folders: { key: string; value: StoredFolder };
  feeds: { key: string; value: StoredFeed };
}

// Separate database so the app's own schema (utils/idb.ts) stays untouched.
let dbPromise: Promise<IDBPDatabase<OwnAudioDB>> | null = null;

function getDb(): Promise<IDBPDatabase<OwnAudioDB>> {
  if (!dbPromise) {
    dbPromise = openDB<OwnAudioDB>('MadstrOwnAudioDB', 1, {
      upgrade(db) {
        db.createObjectStore('folders', { keyPath: 'id' });
        db.createObjectStore('feeds', { keyPath: 'url' });
      },
    });
  }
  return dbPromise;
}

export async function loadFolders(): Promise<StoredFolder[]> {
  try {
    return await (await getDb()).getAll('folders');
  } catch (error) {
    console.error('[ownAudio] Failed to load folders:', error);
    return [];
  }
}

export async function saveFolder(folder: StoredFolder): Promise<void> {
  try {
    await (await getDb()).put('folders', folder);
  } catch (error) {
    console.error('[ownAudio] Failed to save folder:', error);
  }
}

export async function deleteFolder(id: string): Promise<void> {
  try {
    await (await getDb()).delete('folders', id);
  } catch (error) {
    console.error('[ownAudio] Failed to delete folder:', error);
  }
}

export async function loadFeeds(): Promise<StoredFeed[]> {
  try {
    return await (await getDb()).getAll('feeds');
  } catch (error) {
    console.error('[ownAudio] Failed to load feeds:', error);
    return [];
  }
}

export async function saveFeed(feed: StoredFeed): Promise<void> {
  try {
    await (await getDb()).put('feeds', feed);
  } catch (error) {
    console.error('[ownAudio] Failed to save feed:', error);
  }
}

export async function deleteFeed(url: string): Promise<void> {
  try {
    await (await getDb()).delete('feeds', url);
  } catch (error) {
    console.error('[ownAudio] Failed to delete feed:', error);
  }
}
