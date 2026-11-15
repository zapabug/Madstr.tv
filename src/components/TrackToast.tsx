import { useEffect, useState } from 'react';
import type { MediaItem } from '../lib/media.ts';

// How long the song name stays on screen after the music changes: 20 seconds.
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

// "🎵 Song name", shown for 20 s each time the music changes, in the bottom-left bar of the picture.
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
  return <span className="track-text" role="status">{'\u{1F3B5}'} {item.title}</span>;
}
