import { useSyncExternalStore } from 'react';
import { stripNostrRefs, type MediaItem } from './media.ts';
import { nextIndex, nextRate, prevAction, resumeTime } from './queue.ts';

export type Status = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

export interface PlayerState {
  queue: MediaItem[];
  index: number;
  label: string; // what the queue is, e.g. "Music"
  status: Status;
  position: number;
  duration: number;
  rate: number;
  error: string | null;
}

const INITIAL: PlayerState = { queue: [], index: -1, label: '', status: 'idle', position: 0, duration: 0, rate: 1, error: null };

const POS_PREFIX = 'madstr:pos:';
const LAST_VIDEO = 'madstr:lastvideo';
const SAVE_EVERY_SECONDS = 5;

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* storage may be blocked; resume is a nicety */ }
}
function drop(key: string): void {
  try { localStorage.removeItem(key); } catch { /* same */ }
}

export interface LastVideo { item: MediaItem; position: number }

export function loadLastVideo(): LastVideo | null {
  const raw = read(LAST_VIDEO);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<LastVideo>;
    const item = parsed.item;
    if (item && item.kind === 'video' && typeof item.url === 'string' && /^https?:/.test(item.url) && typeof item.id === 'string') {
      return { item: { ...item, title: stripNostrRefs(String(item.title ?? '')).slice(0, 160) }, position: Number(parsed.position) || 0 };
    }
  } catch { /* fall through */ }
  return null;
}

// One player for the whole app: a hidden <audio> that lives forever (so music keeps
// going while you move around) and a <video> that lives in the viewer. The queue is
// the playlist; the current item decides which element plays it.
export class PlayerStore {
  private state: PlayerState = INITIAL;
  private listeners = new Set<() => void>();
  private audioEl: HTMLAudioElement | null = null;
  private videoEl: HTMLVideoElement | null = null;
  private wantPlay = false;
  private failures = 0;
  private lastSavedAt = 0;
  private cleanups: Array<() => void> = [];

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  };
  getSnapshot = (): PlayerState => this.state;

  private set(patch: Partial<PlayerState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach(fn => fn());
  }

  get current(): MediaItem | null {
    return this.state.queue[this.state.index] ?? null;
  }

  private elementFor(item: MediaItem | null): HTMLMediaElement | null {
    if (!item) return null;
    return item.kind === 'video' ? this.videoEl : this.audioEl;
  }

  // --- elements ----------------------------------------------------------------
  registerAudio = (el: HTMLAudioElement | null): void => {
    this.audioEl = el;
    if (el) this.attach(el);
  };

  registerVideo = (el: HTMLVideoElement | null): void => {
    if (!el) {
      this.videoEl?.pause();
      this.videoEl = null;
      if (this.current?.kind === 'video' && this.state.status === 'playing') this.set({ status: 'paused' });
      return;
    }
    this.videoEl = el;
    this.attach(el);
    // The viewer came back while a video was the current item: load it into the new element.
    if (this.current?.kind === 'video') this.loadCurrent(this.wantPlay);
  };

  private attach(el: HTMLMediaElement): void {
    const on = (type: string, fn: () => void) => {
      el.addEventListener(type, fn);
      this.cleanups.push(() => el.removeEventListener(type, fn));
    };
    const mine = () => this.elementFor(this.current) === el;
    on('loadedmetadata', () => {
      if (!mine()) return;
      this.set({ duration: Number.isFinite(el.duration) ? el.duration : 0 });
      const at = resumeTime(Number(read(POS_PREFIX + this.current?.url)) || undefined, el.duration);
      if (at > 0) el.currentTime = at;
    });
    on('durationchange', () => { if (mine() && Number.isFinite(el.duration)) this.set({ duration: el.duration }); });
    on('timeupdate', () => {
      if (!mine()) return;
      this.set({ position: el.currentTime });
      if (el.currentTime - this.lastSavedAt >= SAVE_EVERY_SECONDS || el.currentTime < this.lastSavedAt) this.savePosition(el.currentTime);
    });
    on('playing', () => { if (mine()) { this.failures = 0; this.set({ status: 'playing', error: null }); } });
    on('pause', () => { if (mine() && !el.ended) { this.savePosition(el.currentTime); this.set({ status: this.state.status === 'error' ? 'error' : 'paused' }); } });
    on('waiting', () => { if (mine() && this.wantPlay) this.set({ status: 'loading' }); });
    on('ended', () => { if (mine()) this.onEnded(); });
    on('error', () => { if (mine()) this.onError(); });
  }

  // --- queue -------------------------------------------------------------------------
  setQueue(items: MediaItem[], startIndex = 0, label = '', autoplay = true): void {
    if (items.length === 0) {
      this.pause();
      this.set({ queue: [], index: -1, label, status: 'idle', position: 0, duration: 0, error: null });
      return;
    }
    const index = Math.min(Math.max(startIndex, 0), items.length - 1);
    this.failures = 0;
    this.set({ queue: items, index, label, position: 0, duration: 0, error: null });
    this.loadCurrent(autoplay);
  }

  // Replace the queue behind the current item without interrupting it (the list
  // grows as relays answer). Keeps playing the same item when it is still there.
  updateQueue(items: MediaItem[], label: string): void {
    const playing = this.current;
    if (!playing) return;
    const at = items.findIndex(i => i.id === playing.id);
    if (at < 0) return; // the item is not in this list: leave the queue alone
    this.set({ queue: items, index: at, label });
  }

  private loadCurrent(play: boolean): void {
    const item = this.current;
    const el = this.elementFor(item);
    this.wantPlay = play;
    for (const other of [this.audioEl, this.videoEl]) {
      if (other && other !== el) { other.pause(); }
    }
    if (!item || !el) {
      this.set({ status: item ? 'paused' : 'idle' });
      return;
    }
    if (item.kind === 'video') this.rememberVideo(item, Number(read(POS_PREFIX + item.url)) || 0);
    this.lastSavedAt = 0;
    if (el.getAttribute('src') !== item.url) el.src = item.url;
    el.playbackRate = this.state.rate;
    this.set({ status: play ? 'loading' : 'paused', position: 0, duration: 0, error: null });
    if (play) this.start(el);
  }

  private start(el: HTMLMediaElement): void {
    el.play().catch(error => {
      // Autoplay blocked or the file failed: stay paused; a real failure also fires 'error'.
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        this.wantPlay = false;
        this.set({ status: 'paused' });
      }
    });
  }

  private onEnded(): void {
    const item = this.current;
    if (item) drop(POS_PREFIX + item.url);
    if (item?.kind === 'video') drop(LAST_VIDEO);
    const next = nextIndex(this.state.index, this.state.queue.length);
    if (next === null) {
      this.wantPlay = false;
      this.set({ status: 'paused', position: 0 });
      return;
    }
    this.set({ index: next });
    this.loadCurrent(true);
  }

  private onError(): void {
    this.failures += 1;
    const next = nextIndex(this.state.index, this.state.queue.length);
    if (this.failures >= this.state.queue.length || next === null) {
      this.wantPlay = false;
      this.set({ status: 'error', error: 'Could not play this item' });
      return;
    }
    // Skip the broken item; give up once every item in a row has failed.
    this.set({ index: next, error: 'Skipped an item that would not play' });
    this.loadCurrent(true);
  }

  // --- transport ------------------------------------------------------------------------
  play = (): void => {
    const el = this.elementFor(this.current);
    if (!el) return;
    this.wantPlay = true;
    if (!el.getAttribute('src')) this.loadCurrent(true);
    else this.start(el);
  };

  pause = (): void => {
    this.wantPlay = false;
    this.audioEl?.pause();
    this.videoEl?.pause();
  };

  toggle = (): void => {
    if (this.state.status === 'playing' || this.state.status === 'loading') this.pause();
    else this.play();
  };

  next = (): void => {
    const next = nextIndex(this.state.index, this.state.queue.length);
    if (next === null) return;
    this.set({ index: next });
    this.loadCurrent(this.wantPlay || this.state.status === 'playing');
  };

  prev = (): void => {
    const el = this.elementFor(this.current);
    if (prevAction(el?.currentTime ?? this.state.position, this.state.index) === 'restart') {
      if (el) el.currentTime = 0;
      return;
    }
    this.set({ index: this.state.index - 1 });
    this.loadCurrent(this.wantPlay || this.state.status === 'playing');
  };

  jump = (index: number): void => {
    if (index < 0 || index >= this.state.queue.length) return;
    this.failures = 0;
    this.set({ index });
    this.loadCurrent(true);
  };

  seek = (seconds: number): void => {
    const el = this.elementFor(this.current);
    if (!el || !Number.isFinite(seconds)) return;
    const max = Number.isFinite(el.duration) ? el.duration : seconds;
    el.currentTime = Math.min(Math.max(0, seconds), max);
  };

  seekBy = (delta: number): void => {
    const el = this.elementFor(this.current);
    if (el) this.seek(el.currentTime + delta);
  };

  cycleRate = (): void => {
    const rate = nextRate(this.state.rate);
    if (this.audioEl) this.audioEl.playbackRate = rate;
    if (this.videoEl) this.videoEl.playbackRate = rate;
    this.set({ rate });
  };

  // --- persistence ------------------------------------------------------------------------
  private savePosition(position: number): void {
    const item = this.current;
    if (!item || !Number.isFinite(position)) return;
    this.lastSavedAt = position;
    write(POS_PREFIX + item.url, String(Math.floor(position)));
    if (item.kind === 'video') this.rememberVideo(item, position);
  }

  private rememberVideo(item: MediaItem, position: number): void {
    write(LAST_VIDEO, JSON.stringify({ item, position: Math.floor(position) }));
  }

  dispose(): void {
    this.cleanups.forEach(fn => fn());
    this.cleanups = [];
  }
}

export const player = new PlayerStore();

export function usePlayer(): PlayerState {
  return useSyncExternalStore(player.subscribe, player.getSnapshot, player.getSnapshot);
}
