// Remembered folders in the Android app (spec feat-android-native §N2): what the native scan returns becomes
// local tracks with the app's own file address. Pure; the entries cross a bridge, so they are checked.
import { matchesKind, titleFromName, type LocalKind } from './fileKinds.ts';
import { MAX_LOCAL_FILES, type LocalTrack } from './localFolder.ts';

export const LOCAL_PREFIX = '/_madstr_local/';
export const NO_ACCESS_TEXT = 'No access: remove it and add it again';
export const NO_PICKER_TEXT = 'This device has no folder picker';

export interface NativeEntry {
  uri: string; // content:// document uri inside the folder
  path: string; // relative path, for a stable id and order
  name: string;
  mime: string;
  modified: number; // ms
}

// base64url of the UTF-8 document uri; LocalFileServer.java decodes it.
export function localFileUrl(docUri: string): string {
  const bytes = new TextEncoder().encode(docUri);
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return LOCAL_PREFIX + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '');

export function tracksFromEntries(folderId: string, raw: unknown, kind: LocalKind): LocalTrack[] {
  if (!Array.isArray(raw)) return [];
  const entries: NativeEntry[] = [];
  for (const e of raw as Record<string, unknown>[]) {
    if (!e || typeof e !== 'object') continue;
    const uri = str(e.uri, 4000);
    const name = str(e.name, 400);
    if (!uri.startsWith('content://') || !name) continue;
    const mime = str(e.mime, 100).toLowerCase();
    if (!matchesKind(name, mime, kind)) continue;
    const modified = typeof e.modified === 'number' && Number.isFinite(e.modified) && e.modified > 0 ? e.modified : 0;
    entries.push({ uri, path: str(e.path, 2000) || name, name, mime, modified });
  }
  entries.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' }));
  return entries.slice(0, MAX_LOCAL_FILES).map(e => ({
    id: `${folderId}:${e.path}`,
    title: titleFromName(e.name),
    url: localFileUrl(e.uri),
    modified: e.modified,
    kind,
  }));
}

// The message for a failed native call (Capacitor puts the plugin's code on the error).
export function nativeErrorText(error: unknown, fallback: string): string {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === 'NO_ACCESS') return NO_ACCESS_TEXT;
  if (code === 'NO_PICKER') return NO_PICKER_TEXT;
  return fallback;
}
