// When the Android app keeps its background-play service up (spec feat-android-play §A2). Pure: the
// native calls and the timer are passed in, so it is tested without a device.
import type { Status } from './player.ts';

export const KEEP_ALIVE_STOP_MS = 3000; // rides over the gap between two tracks / the video-to-audio handover
export const NOTE_TITLE_MAX = 80;
export const NOTE_FALLBACK = 'Playing';

export function keepsAlive(status: Status): boolean {
  return status === 'playing' || status === 'loading';
}

// The notification's text: plain, one line, clipped (titles come from relays, feeds and files).
export function noteTitle(raw: string | undefined): string {
  // eslint-disable-next-line no-control-regex
  const clean = (raw ?? '').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) return NOTE_FALLBACK;
  return clean.length > NOTE_TITLE_MAX ? `${clean.slice(0, NOTE_TITLE_MAX - 1)}…` : clean;
}

export interface KeepAliveDeps {
  start: (_title: string) => void; // start the service, or update its notification
  stop: () => void;
  setTimer: (_fn: () => void, _ms: number) => unknown;
  clearTimer: (_handle: unknown) => void;
}

export function createKeepAlive(deps: KeepAliveDeps): { update: (_status: Status, _title: string | undefined) => void } {
  let running = false;
  let shown = '';
  let pendingStop: unknown = null;
  const cancelStop = () => {
    if (pendingStop !== null) { deps.clearTimer(pendingStop); pendingStop = null; }
  };
  return {
    update(status, title) {
      if (keepsAlive(status)) {
        cancelStop();
        const text = noteTitle(title);
        if (!running || text !== shown) { running = true; shown = text; deps.start(text); }
      } else if (running && pendingStop === null) {
        pendingStop = deps.setTimer(() => { pendingStop = null; running = false; shown = ''; deps.stop(); }, KEEP_ALIVE_STOP_MS);
      }
    },
  };
}
