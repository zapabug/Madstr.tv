import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseDuration, type MediaItem } from '../lib/media.ts';
import type { LocalKind } from '../lib/fileKinds.ts';
import { loadFeed, type FeedItem } from '../lib/rssFeed.ts';
import {
  loadFolders, saveFolder, deleteFolder, loadFeeds, saveFeed, deleteFeed,
  type FsDirHandle, type StoredFolder, type StoredFeed,
} from '../lib/ownAudioStore.ts';
import {
  canPickFolder, pickFolder, hasReadPermission, scanFolder, tracksFromFiles, type LocalTrack,
} from '../lib/localFolder.ts';
import { nativeErrorText } from '../lib/nativeFolder.ts';
import { isNativeApp } from '../lib/platform.ts';

export type SourceStatus = 'loading' | 'ready' | 'needs-permission' | 'error';

export interface OwnFolder {
  kind: LocalKind;
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

const SESSION_PREFIX = 'session-';
const isSession = (id: string): boolean => id.startsWith(SESSION_PREFIX);

export interface OwnAudio {
  local: MediaItem[];
  pictures: MediaItem[];
  rss: MediaItem[];
  folders: OwnFolder[];
  feeds: OwnFeed[];
  canPickFolder: boolean;
  folderNote: string; // why the last folder pick failed, '' when it did not
  addFolder: (_kind?: LocalKind) => Promise<void>;
  addFiles: (_files: File[], _kind?: LocalKind) => void;
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
    if (track.url) return track.url; // the app's own file address
    let url = objectUrls.current.get(track.id);
    if (!url && track.file) {
      url = URL.createObjectURL(track.file);
      objectUrls.current.set(track.id, url);
    }
    return url ?? '';
  }, []);

  const loadFolderTracks = useCallback(async (folder: StoredFolder, request: boolean) => {
    setFolderState(prev => ({ ...prev, [folder.id]: { status: 'loading' } }));
    if (folder.uri) {
      try {
        const { listNativeFolder } = await import('../native/localFolders.ts');
        const tracks = await listNativeFolder(folder.id, folder.uri, folder.kind ?? 'audio');
        setTracksByFolder(prev => ({ ...prev, [folder.id]: tracks }));
        setFolderState(prev => ({ ...prev, [folder.id]: { status: 'ready' } }));
      } catch (error) {
        console.error('[ownAudio] Folder scan failed:', error);
        setFolderState(prev => ({ ...prev, [folder.id]: { status: 'error', error: nativeErrorText(error, 'Could not read this folder') } }));
      }
      return;
    }
    if (!folder.handle) {
      setFolderState(prev => ({ ...prev, [folder.id]: { status: 'error', error: 'Could not read this folder' } }));
      return;
    }
    try {
      if (!(await hasReadPermission(folder.handle, request))) {
        setFolderState(prev => ({ ...prev, [folder.id]: { status: 'needs-permission' } }));
        return;
      }
      const tracks = await scanFolder(folder.id, folder.handle, folder.kind ?? 'audio');
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

  const [folderNote, setFolderNote] = useState('');

  const addFolder = useCallback(async (kind: LocalKind = 'audio') => {
    setFolderNote('');
    let folder: StoredFolder;
    const id = `dir-${Date.now().toString(36)}`;
    if (isNativeApp()) {
      let picked: { uri: string; name: string } | null;
      try {
        const { pickNativeFolder } = await import('../native/localFolders.ts');
        picked = await pickNativeFolder();
      } catch (error) {
        console.error('[ownAudio] Folder pick failed:', error);
        setFolderNote(nativeErrorText(error, 'Could not open the folder picker'));
        return;
      }
      if (!picked) return;
      folder = { id, name: (picked.name || 'Folder').slice(0, 80), uri: picked.uri, kind };
    } else {
      let handle: FsDirHandle | null;
      try {
        handle = await pickFolder();
      } catch (error) {
        console.error('[ownAudio] Folder pick failed:', error);
        setFolderNote('Could not open the folder picker');
        return;
      }
      if (!handle) return;
      folder = { id, name: handle.name.slice(0, 80), handle, kind };
    }
    await saveFolder(folder);
    setStoredFolders(prev => [...prev, folder]);
    await loadFolderTracks(folder, true);
  }, [loadFolderTracks]);

  const addFiles = useCallback((files: File[], kind: LocalKind = 'audio') => {
    const group = `${SESSION_PREFIX}${kind}`;
    const tracks = tracksFromFiles(`${group}-${Date.now().toString(36)}`, files, kind);
    if (tracks.length === 0) return;
    setTracksByFolder(prev => ({ ...prev, [group]: [...(prev[group] ?? []), ...tracks] }));
    setFolderState(prev => ({ ...prev, [group]: { status: 'ready' } }));
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
    if (!isSession(id)) {
      const uri = storedFolders.find(f => f.id === id)?.uri;
      if (uri) void import('../native/localFolders.ts').then(m => m.releaseNativeFolder(uri)).catch((error: unknown) => console.error('[ownAudio] release failed:', error));
      setStoredFolders(prev => prev.filter(f => f.id !== id));
      void deleteFolder(id);
    }
  }, [tracksByFolder, dropTrackUrls, storedFolders]);

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
      id: f.id, kind: f.kind ?? 'audio', name: f.name, session: false,
      status: folderState[f.id]?.status ?? 'loading',
      error: folderState[f.id]?.error,
      count: tracksByFolder[f.id]?.length ?? 0,
    }));
    for (const kind of ['audio', 'image'] as const) {
      const group = `${SESSION_PREFIX}${kind}`;
      if (tracksByFolder[group]) {
        list.push({ id: group, kind, name: 'Picked files (this session)', session: true, status: 'ready', count: tracksByFolder[group].length });
      }
    }
    return list;
  }, [storedFolders, folderState, tracksByFolder]);

  const feeds = useMemo((): OwnFeed[] => storedFeeds.map(f => ({
    url: f.url, name: f.name,
    status: feedState[f.url]?.status ?? 'loading',
    error: feedState[f.url]?.error,
    count: itemsByFeed[f.url]?.length ?? 0,
  })), [storedFeeds, feedState, itemsByFeed]);

  const { local, pictures } = useMemo(() => {
    const audio: MediaItem[] = [];
    const images: MediaItem[] = [];
    Object.values(tracksByFolder).forEach(tracks => {
      tracks.forEach(track => {
        const item: MediaItem = {
          id: `local:${track.id}`,
          kind: track.kind,
          origin: 'local',
          url: urlFor(track),
          title: track.title,
          createdAt: Math.floor((track.file?.lastModified ?? track.modified ?? 0) / 1000),
        };
        (track.kind === 'image' ? images : audio).push(item);
      });
    });
    return { local: audio, pictures: images };
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
    local, pictures, rss, folders, feeds,
    canPickFolder: canPickFolder() || isNativeApp(),
    folderNote,
    addFolder, addFiles, reconnectFolder, removeFolder, addFeed, refreshFeed, removeFeed,
  };
}
