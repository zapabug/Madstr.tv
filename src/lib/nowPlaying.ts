// What the system's media controls show, and when they are told (spec feat-android-native §N1). Used by the
// Android media session and by the browser's navigator.mediaSession. Pure: the outputs and the clock are
// passed in, so it is tested without a device.
import { isHttpUrl } from './media.ts';
import type { PlayerState, Status } from './player.ts';

export const TEXT_MAX = 80;
export const PAUSED_KEEP_MS = 10 * 60_000; // the controls stay this long without playing
export const IDLE_END_MS = 3000; // an empty player ends them after this
export const DRIFT_S = 2; // resend the position when it is this far from where the controls expect it
export const FALLBACK_TITLE = 'Playing';

export interface NowPlaying {
  title: string;
  subtitle: string;
  image: string; // http(s) or ''
  status: Status;
  position: number; // seconds
  duration: number; // seconds, 0 = unknown
  rate: number;
}

export function isActive(status: Status): boolean {
  return status === 'playing' || status === 'loading';
}

// Plain, one line, clipped (titles come from relays, feeds and files).
export function clipText(raw: string | undefined): string {
  // eslint-disable-next-line no-control-regex
  const clean = (raw ?? '').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim();
  return clean.length > TEXT_MAX ? `${clean.slice(0, TEXT_MAX - 1)}…` : clean;
}

export function nowPlayingFrom(state: PlayerState): NowPlaying | null {
  const item = state.index >= 0 ? state.queue[state.index] : undefined;
  if (!item || state.status === 'idle') return null;
  const finite = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);
  return {
    title: clipText(item.title) || FALLBACK_TITLE,
    subtitle: clipText(item.subtitle) || clipText(state.label),
    image: item.image && isHttpUrl(item.image) ? item.image : '',
    status: state.status,
    // A live station or show (feat-radio §RA3) has no length and nothing to seek: no progress on the controls.
    position: item.live ? 0 : finite(state.position),
    duration: item.live ? 0 : finite(state.duration) || finite(item.duration ?? 0),
    rate: finite(state.rate) || 1,
  };
}

export interface BridgeDeps {
  show: (_now: NowPlaying) => void; // show or update the controls
  end: () => void; // take them away
  setTimer: (_fn: () => void, _ms: number) => unknown;
  clearTimer: (_handle: unknown) => void;
  now: () => number; // ms
}

export function createNowPlayingBridge(deps: BridgeDeps): { update: (_state: PlayerState) => void } {
  let shown: NowPlaying | null = null;
  let shownAt = 0;
  let idleTimer: unknown = null;
  let pausedTimer: unknown = null;
  const clear = (which: 'idle' | 'paused') => {
    const h = which === 'idle' ? idleTimer : pausedTimer;
    if (h !== null) deps.clearTimer(h);
    if (which === 'idle') idleTimer = null; else pausedTimer = null;
  };
  const end = () => {
    clear('idle'); clear('paused');
    shown = null;
    deps.end();
  };
  const changed = (a: NowPlaying, b: NowPlaying): boolean => {
    if (a.title !== b.title || a.subtitle !== b.subtitle || a.image !== b.image) return true;
    if (a.status !== b.status || a.rate !== b.rate || Math.round(a.duration) !== Math.round(b.duration)) return true;
    const elapsed = b.status === 'playing' ? ((deps.now() - shownAt) / 1000) * b.rate : 0;
    return Math.abs(a.position - (b.position + elapsed)) > DRIFT_S;
  };
  return {
    update(state) {
      const next = nowPlayingFrom(state);
      if (!next) {
        clear('paused');
        if (shown && idleTimer === null) idleTimer = deps.setTimer(() => { idleTimer = null; end(); }, IDLE_END_MS);
        return;
      }
      clear('idle');
      if (!shown && !isActive(next.status)) return; // the controls start with playing, not with a paused queue
      if (isActive(next.status)) clear('paused');
      else if (pausedTimer === null) pausedTimer = deps.setTimer(() => { pausedTimer = null; end(); }, PAUSED_KEEP_MS);
      if (!shown || changed(next, shown)) {
        shown = next;
        shownAt = deps.now();
        deps.show(next);
      }
    },
  };
}
