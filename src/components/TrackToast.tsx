import { useEffect, useState } from 'react';
import type { MediaItem } from '../lib/media.ts';
import { NoteIcon } from './icons.tsx';

// How long the track name stays on screen after the music changes: 20 seconds.
export const TRACK_TOAST_MS = 20_000;

function toastMs(): number {
  // Only for testing: localStorage 'madstr:toastMs' shortens it.
  try {
    const n = Number(localStorage.getItem('madstr:toastMs'));
    return Number.isFinite(n) && n >= 300 ? n : TRACK_TOAST_MS;
  } catch {
    return TRACK_TOAST_MS;
  }
}

// The name of the music that just started, shown for 20 s each time the track changes.
export function TrackToast({ item }: { item: MediaItem | undefined }) {
  const id = item?.id;
  const [shownId, setShownId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!id) { setShownId(undefined); return; }
    setShownId(id);
    const timer = window.setTimeout(() => setShownId(undefined), toastMs());
    return () => window.clearTimeout(timer);
  }, [id]);

  if (!item || shownId !== item.id) return null;
  return (
    <p className="track-toast" role="status">
      <NoteIcon size={18} />
      <span className="track-toast-text">{item.title}{item.subtitle ? ` · ${item.subtitle}` : ''}</span>
    </p>
  );
}
