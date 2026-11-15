import { FsDirHandle, FsFileHandle } from './ownAudioStore';

export const AUDIO_EXT = /\.(mp3|m4a|ogg|opus|aac|wav|flac)$/i;
export const MAX_LOCAL_FILES = 2000;
const MAX_DEPTH = 6;

export interface LocalTrack {
  id: string; // stable per folder + relative path
  title: string;
  file: File;
}

export function titleFromName(name: string): string {
  return name.replace(AUDIO_EXT, '').replace(/[_]+/g, ' ').trim().slice(0, 200) || name;
}

type PickerWindow = Window & { showDirectoryPicker?: (_options?: { mode?: 'read' }) => Promise<FsDirHandle> };

export function canPickFolder(): boolean {
  return typeof (window as PickerWindow).showDirectoryPicker === 'function';
}

export async function pickFolder(): Promise<FsDirHandle | null> {
  const picker = (window as PickerWindow).showDirectoryPicker;
  if (!picker) return null;
  try {
    return await picker.call(window, { mode: 'read' });
  } catch (error) {
    // The user closing the dialog is not an error.
    if (error instanceof DOMException && error.name === 'AbortError') return null;
    throw error;
  }
}

// Read access must be granted again after a reload in many browsers; asking needs
// a user gesture, so only call with request=true from a click handler.
export async function hasReadPermission(handle: FsDirHandle, request: boolean): Promise<boolean> {
  if (!handle.queryPermission) return true;
  if ((await handle.queryPermission({ mode: 'read' })) === 'granted') return true;
  if (!request || !handle.requestPermission) return false;
  return (await handle.requestPermission({ mode: 'read' })) === 'granted';
}

export async function scanFolder(folderId: string, root: FsDirHandle): Promise<LocalTrack[]> {
  const tracks: LocalTrack[] = [];

  async function walk(dir: FsDirHandle, prefix: string, depth: number): Promise<void> {
    for await (const entry of dir.values()) {
      if (tracks.length >= MAX_LOCAL_FILES) return;
      if (entry.kind === 'directory') {
        if (depth < MAX_DEPTH) await walk(entry, `${prefix}${entry.name}/`, depth + 1);
      } else if (AUDIO_EXT.test(entry.name)) {
        try {
          const file = await (entry as FsFileHandle).getFile();
          tracks.push({ id: `${folderId}:${prefix}${entry.name}`, title: titleFromName(entry.name), file });
        } catch (error) {
          console.error('[ownAudio] Could not read file:', entry.name, error);
        }
      }
    }
  }

  await walk(root, '', 0);
  tracks.sort((a, b) => a.id.localeCompare(b.id));
  return tracks;
}

// Fallback for browsers without showDirectoryPicker: plain picked files, kept for
// this session only.
export function tracksFromFiles(groupId: string, files: File[]): LocalTrack[] {
  return files
    .filter(f => AUDIO_EXT.test(f.name) || f.type.startsWith('audio/'))
    .slice(0, MAX_LOCAL_FILES)
    .map((file, i) => ({ id: `${groupId}:${i}:${file.name}`, title: titleFromName(file.name), file }));
}
