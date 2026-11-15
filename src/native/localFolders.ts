// The Android app's remembered folders (spec feat-android-native §N2): the LocalFolders plugin picks a folder
// with Android's picker, scans it and gives the access back on remove. Loaded only in the app.
import { registerPlugin } from '@capacitor/core';
import type { LocalKind } from '../lib/fileKinds.ts';
import type { LocalTrack } from '../lib/localFolder.ts';
import { tracksFromEntries } from '../lib/nativeFolder.ts';

interface LocalFoldersPlugin {
  pick(): Promise<{ uri?: unknown; name?: unknown }>;
  list(_options: { uri: string; kind: LocalKind }): Promise<{ files?: unknown }>;
  release(_options: { uri: string }): Promise<void>;
}

const LocalFolders = registerPlugin<LocalFoldersPlugin>('LocalFolders');

// Null when the picker was closed without a folder.
export async function pickNativeFolder(): Promise<{ uri: string; name: string } | null> {
  const r = await LocalFolders.pick();
  if (typeof r.uri !== 'string' || !r.uri.startsWith('content://')) return null;
  return { uri: r.uri, name: typeof r.name === 'string' ? r.name : '' };
}

export async function listNativeFolder(folderId: string, uri: string, kind: LocalKind): Promise<LocalTrack[]> {
  const r = await LocalFolders.list({ uri, kind });
  return tracksFromEntries(folderId, r.files, kind);
}

export async function releaseNativeFolder(uri: string): Promise<void> {
  await LocalFolders.release({ uri });
}
