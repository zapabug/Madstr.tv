import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseDuration, type MediaItem } from '../lib/media.ts';
import { loadFeed, type FeedItem } from '../lib/rssFeed.ts';
import {
  loadFolders, saveFolder, deleteFolder, loadFeeds, saveFeed, deleteFeed,
  type FsDirHandle, type StoredFolder, type StoredFeed,
} from '../lib/ownAudioStore.ts';
import {
  canPickFolder, pickFolder, hasReadPermission, scanFolder, tracksFromFiles, type LocalTrack,
} from '../lib/localFolder.ts';

export type SourceStatus = 'loading' | 'ready' | 'needs-permission' | 'error';

export interface OwnFolder {
  id: string;
  name: string;
  status: SourceStatus;
  count: number;
  session: boolean; // true = picked files kept for this session only
  error?: string;
}

export interface OwnFeed {
  url: string;
  name: string;
  status: SourceStatus;
  count: number;
  error?: string;
}

const SESSION_GROUP = 'session';

export interface OwnAudio {
  local: MediaItem[];
  rss: MediaItem[];
  folders: OwnFolder[];
  feeds: OwnFeed[];
  canPickFolder: boolean;
  addFolder: () => Promise<void>;
  addFiles: (_files: File[]) => void;
  reconnectFolder: (_id: string) => Promise<void>;
  removeFolder: (_id: string) => void;
  addFeed: (_url: string) => Promise<void>;
  refreshFeed: (_url: string) => Promise<void>;
  removeFeed: (_url: string) => void;
}

export function useOwnAudioState(): OwnAudio {
  const [storedFolders, setStoredFolders] = useState<StoredFolder[]>([]);
  const [folderState, setFolderState] = useState<Record<string, { status: SourceStatus; error?: string }>>({});
  const [tracksByFolder, setTracksByFolder] = useState<Record<string, LocalTrack[]>>({});
  const [storedFeeds, setStoredFeeds] = useState<StoredFeed[]>([]);
  const [feedState, setFeedState] = useState<Record<string, { status: SourceStatus; error?: string }>>({});
  const [itemsByFeed, setItemsByFeed] = useState<Record<string, FeedItem[]>>({});
  const objectUrls = useRef<Map<string, string>>(new Map());

  // One object URL per local file, created on demand and kept until the track goes away.
  const urlFor = useCallback((track: LocalTrack): string => {
    let url = objectUrls.current.get(track.id);
    if (!url) {
      url = URL.createObjectURL(track.file);
      objectUrls.current.set(track.id, url);
    }
    return url;
  }, []);

  const loadFolderTracks = useCallback(async (folder: StoredFolder, request: boolean) => {
    setFolderState(prev => ({ ...prev, [folder.id]: { status: 'loading' } }));
    try {
      if (!(await hasReadPermission(folder.handle, request))) {
        setFolderState(prev => ({ ...prev, [folder.id]: { status: 'needs-permission' } }));
        return;
      }
      const tracks = await scanFolder(folder.id, folder.handle);
      setTracksByFolder(prev => ({ ...prev, [folder.id]: tracks }));
      setFolderState(prev => ({ ...prev, [folder.id]: { status: 'ready' } }));
    } catch (error) {
      console.error('[ownAudio] Folder scan failed:', error);
      setFolderState(prev => ({ ...prev, [folder.id]: { status: 'error', error: 'Could not read this folder' } }));
    }
  }, []);

  const loadFeedItems = useCallback(async (url: string) => {
    setFeedState(prev => ({ ...prev, [url]: { status: 'loading' } }));
    try {
      const parsed = await loadFeed(url);
      setItemsByFeed(prev => ({ ...prev, [url]: parsed.items }));
      setFeedState(prev => ({
        ...prev,
        [url]: parsed.items.length === 0 ? { status: 'error', error: 'No audio episodes in this feed' } : { status: 'ready' },
      }));
      return parsed.title;
    } catch (error) {
      console.error('[ownAudio] Feed load failed:', url, error);
      setFeedState(prev => ({ ...prev, [url]: { status: 'error', error: error instanceof Error ? error.message : 'Could not load feed' } }));
      return '';
    }
  }, []);

  // Restore remembered sources once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [folders, feeds] = await Promise.all([loadFolders(), loadFeeds()]);
      if (cancelled) return;
      setStoredFolders(folders);
      setStoredFeeds(feeds);
      folders.forEach(f => { void loadFolderTracks(f, false); });
      feeds.forEach(f => { void loadFeedItems(f.url); });
    })();
    return () => { cancelled = true; };
  }, [loadFolderTracks, loadFeedItems]);

  // Release object URLs on unmount.
  useEffect(() => {
    const urls = objectUrls.current;
    return () => {
      urls.forEach(u => URL.revokeObjectURL(u));
      urls.clear();
    };
  }, []);

  const addFolder = useCallback(async () => {
    const handle: FsDirHandle | null = await pickFolder();
    if (!handle) return;
    const folder: StoredFolder = { id: `dir-${Date.now().toString(36)}`, name: handle.name.slice(0, 80), handle };
    await saveFolder(folder);
    setStoredFolders(prev => [...prev, folder]);
    await loadFolderTracks(folder, true);
  }, [loadFolderTracks]);

  const addFiles = useCallback((files: File[]) => {
    const tracks = tracksFromFiles(`${SESSION_GROUP}-${Date.now().toString(36)}`, files);
    if (tracks.length === 0) return;
    setTracksByFolder(prev => ({ ...prev, [SESSION_GROUP]: [...(prev[SESSION_GROUP] ?? []), ...tracks] }));
    setFolderState(prev => ({ ...prev, [SESSION_GROUP]: { status: 'ready' } }));
  }, []);

  const reconnectFolder = useCallback(async (id: string) => {
    const folder = storedFolders.find(f => f.id === id);
    if (folder) await loadFolderTracks(folder, true);
  }, [storedFolders, loadFolderTracks]);

  const dropTrackUrls = useCallback((tracks: LocalTrack[] | undefined) => {
    (tracks ?? []).forEach(t => {
      const url = objectUrls.current.get(t.id);
      if (url) {
        URL.revokeObjectURL(url);
        objectUrls.current.delete(t.id);
      }
    });
  }, []);

  const removeFolder = useCallback((id: string) => {
    dropTrackUrls(tracksByFolder[id]);
    setTracksByFolder(prev => { const next = { ...prev }; delete next[id]; return next; });
    setFolderState(prev => { const next = { ...prev }; delete next[id]; return next; });
    if (id !== SESSION_GROUP) {
      setStoredFolders(prev => prev.filter(f => f.id !== id));
      void deleteFolder(id);
    }
  }, [tracksByFolder, dropTrackUrls]);

  const addFeed = useCallback(async (rawUrl: string) => {
    const url = rawUrl.trim();
    if (!url || storedFeeds.some(f => f.url === url)) return;
    const title = await loadFeedItems(url);
    const feed: StoredFeed = { url, name: (title || url.replace(/^https?:\/\//, '').split('/')[0]).slice(0, 80), addedAt: Date.now() };
    setStoredFeeds(prev => [...prev, feed]);
    await saveFeed(feed);
  }, [storedFeeds, loadFeedItems]);

  const refreshFeed = useCallback(async (url: string) => { await loadFeedItems(url); }, [loadFeedItems]);

  const removeFeed = useCallback((url: string) => {
    setStoredFeeds(prev => prev.filter(f => f.url !== url));
    setItemsByFeed(prev => { const next = { ...prev }; delete next[url]; return next; });
    setFeedState(prev => { const next = { ...prev }; delete next[url]; return next; });
    void deleteFeed(url);
  }, []);

  const folders = useMemo((): OwnFolder[] => {
    const list: OwnFolder[] = storedFolders.map(f => ({
      id: f.id, name: f.name, session: false,
      status: folderState[f.id]?.status ?? 'loading',
      error: folderState[f.id]?.error,
      count: tracksByFolder[f.id]?.length ?? 0,
    }));
    if (tracksByFolder[SESSION_GROUP]) {
      list.push({ id: SESSION_GROUP, name: 'Picked files (this session)', session: true, status: 'ready', count: tracksByFolder[SESSION_GROUP].length });
    }
    return list;
  }, [storedFolders, folderState, tracksByFolder]);

  const feeds = useMemo((): OwnFeed[] => storedFeeds.map(f => ({
    url: f.url, name: f.name,
    status: feedState[f.url]?.status ?? 'loading',
    error: feedState[f.url]?.error,
    count: itemsByFeed[f.url]?.length ?? 0,
  })), [storedFeeds, feedState, itemsByFeed]);

  const local = useMemo((): MediaItem[] => {
    const out: MediaItem[] = [];
    Object.values(tracksByFolder).forEach(tracks => {
      tracks.forEach(track => {
        out.push({
          id: `local:${track.id}`,
          kind: 'audio',
          origin: 'local',
          url: urlFor(track),
          title: track.title,
          createdAt: Math.floor(track.file.lastModified / 1000),
        });
      });
    });
    return out;
  }, [tracksByFolder, urlFor]);

  const rss = useMemo((): MediaItem[] => {
    const out: MediaItem[] = [];
    const feedName = new Map(storedFeeds.map(f => [f.url, f.name]));
    Object.entries(itemsByFeed).forEach(([feedUrl, items]) => {
      items.forEach(item => {
        out.push({
          id: `rss:${feedUrl}:${item.guid}`,
          kind: 'audio',
          origin: 'rss',
          url: item.url,
          title: item.title,
          subtitle: feedName.get(feedUrl),
          image: item.image,
          duration: parseDuration(item.duration),
          createdAt: item.pubDate,
        });
      });
    });
    return out;
  }, [itemsByFeed, storedFeeds]);

  return {
    local, rss, folders, feeds,
    canPickFolder: canPickFolder(),
    addFolder, addFiles, reconnectFolder, removeFolder, addFeed, refreshFeed, removeFeed,
  };
}
