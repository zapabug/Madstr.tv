import { useSyncExternalStore } from 'react';
import { isHttpUrl, stripNostrRefs, type MediaItem } from './media.ts';
import { played } from './played.ts';
import { START_TIMEOUT_MS, isHls } from './radio.ts';
import { READABLE_KEY, askToRead, crossHost, parseMemory, remember, serializeMemory } from './readableHosts.ts';
import { mergeShuffled, nextIndex, nextRate, prevAction, rateKey, resumeTime, shuffleAround, unshuffle, validRate } from './queue.ts';

export type Status = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

export interface PlayerState {
  queue: MediaItem[];
  index: number;
  label: string; // what the queue is, e.g. "Music"
  status: Status;
  position: number;
  duration: number;
  rate: number;
  shuffle: boolean; // the playlist is in shuffled order (spec §Added later)
  error: string | null;
  liveSince: number | null; // a live item (feat-radio §RA3): when its sound started (ms), for "listening for"
}

const INITIAL: PlayerState = { queue: [], index: -1, label: '', status: 'idle', position: 0, duration: 0, rate: 1, shuffle: false, error: null, liveSince: null };

const POS_PREFIX = 'madstr:pos:';
const LAST_VIDEO = 'madstr:lastvideo';
const SAVE_EVERY_SECONDS = 5;
export const NOT_ANSWERING = 'Station not answering';

// hls.js, loaded only when an HLS stream starts in a browser that cannot play HLS itself (feat-radio §RA3b). The full
// build, not hls.js/light: zap.stream and Cloudflare Stream shows carry their sound as a separate audio track
// (EXT-X-MEDIA TYPE=AUDIO), which the light build cannot play (4 of 8 live shows were silent, 2026-11-16).
type HlsLike = { loadSource(_url: string): void; attachMedia(_el: HTMLMediaElement): void; destroy(): void; on(_event: string, _fn: (_e: unknown, _data: { fatal?: boolean }) => void): void };
type HlsClass = { new (_config?: object): HlsLike; isSupported(): boolean; Events: { ERROR: string } };
let hlsClass: Promise<HlsClass | null> | null = null;
function loadHls(): Promise<HlsClass | null> {
  hlsClass ??= import('hls.js').then(m => m.default as unknown as HlsClass).catch(() => null);
  return hlsClass;
}

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* storage may be blocked; resume is a nicety */ }
}
function drop(key: string): void {
  try { localStorage.removeItem(key); } catch { /* same */ }
}

// duration: the video's length as the player measured it (seconds), when known; the Continue sticker's bar uses it.
export interface LastVideo { item: MediaItem; position: number; duration?: number }

export function loadLastVideo(): LastVideo | null {
  const raw = read(LAST_VIDEO);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<LastVideo>;
    const item = parsed.item;
    if (item && item.kind === 'video' && typeof item.url === 'string' && /^https?:/.test(item.url) && typeof item.id === 'string') {
      const duration = Number(parsed.duration);
      return {
        item: { ...item, title: stripNostrRefs(String(item.title ?? '')).slice(0, 160), image: isHttpUrl(item.image) ? item.image : undefined },
        position: Number(parsed.position) || 0,
        duration: Number.isFinite(duration) && duration > 0 ? duration : undefined,
      };
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
  private attached = new WeakSet<HTMLMediaElement>(); // React may hand the same element over twice (StrictMode, reloads)
  private natural: MediaItem[] = []; // the playlist in its normal order, for turning shuffle off
  private pendingSeek: number | null = null; // where to start once the element has loaded (a hand-over)
  private loadedId: string | null = null; // the item last loaded, to mark it played when you move on
  private startedLoaded = false; // whether that item actually played
  private loadedLive = false;
  private hls: { el: HTMLMediaElement; url: string; player: HlsLike } | null = null;
  private silentTimer: ReturnType<typeof setTimeout> | null = null; // a live item that does not start or stops
  // feat-lava-lamp LL1: hosts that let the app read their sound; the url loaded asking to read it that has not
  // played yet; the url loaded again without asking after that failed.
  private readable = parseMemory(read(READABLE_KEY));
  private asking: string | null = null;
  private retried: string | null = null;

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

  // A video plays in the viewer's <video>; with no viewer on screen its sound plays in the hidden <audio>.
  private elementFor(item: MediaItem | null): HTMLMediaElement | null {
    if (!item) return null;
    return item.kind === 'video' ? this.videoEl ?? this.audioEl : this.audioEl;
  }

  // The hidden <audio>, for the lava lamp's sound tap (feat-lava-lamp LL2), which only listens to it.
  get soundElement(): HTMLAudioElement | null {
    return this.audioEl;
  }

  // --- elements ----------------------------------------------------------------
  registerAudio = (el: HTMLAudioElement | null): void => {
    this.audioEl = el;
    if (el) this.attach(el);
  };

  registerVideo = (el: HTMLVideoElement | null): void => {
    if (!el) {
      // Leaving the viewer: the video's sound carries on in the hidden <audio> from the same second.
      const old = this.videoEl;
      this.videoEl = null; // first, so the pause below is no longer this item's element
      if (!old) return;
      const handingOver = this.current?.kind === 'video' && !!old.getAttribute('src');
      const at = old.currentTime;
      old.pause();
      if (handingOver) {
        this.savePosition(at);
        this.loadCurrent(this.wantPlay, at);
      }
      return;
    }
    // The viewer came back while a video was the current item: the picture picks up where the sound is.
    const sound = this.audioEl;
    const at = this.current?.kind === 'video' && sound?.getAttribute('src') === this.current.url
      ? this.pendingSeek ?? sound.currentTime
      : undefined;
    this.videoEl = el;
    this.attach(el);
    if (this.current?.kind === 'video') this.loadCurrent(this.wantPlay, at);
  };

  private attach(el: HTMLMediaElement): void {
    // Once per element: a second set of listeners would count every failure twice and skip two items.
    if (this.attached.has(el)) return;
    this.attached.add(el);
    const on = (type: string, fn: () => void) => {
      el.addEventListener(type, fn);
      this.cleanups.push(() => el.removeEventListener(type, fn));
    };
    const mine = () => this.elementFor(this.current) === el;
    on('loadedmetadata', () => {
      if (!mine()) return;
      this.set({ duration: Number.isFinite(el.duration) ? el.duration : 0 });
      const handOver = this.pendingSeek;
      this.pendingSeek = null;
      const at = this.current?.live ? 0 : handOver ?? resumeTime(Number(read(POS_PREFIX + this.current?.url)) || undefined, el.duration);
      if (at > 0) el.currentTime = at;
    });
    on('durationchange', () => { if (mine() && Number.isFinite(el.duration)) this.set({ duration: el.duration }); });
    on('timeupdate', () => {
      if (!mine()) return;
      this.set({ position: el.currentTime });
      if (this.current?.live) return;
      if (el.currentTime - this.lastSavedAt >= SAVE_EVERY_SECONDS || el.currentTime < this.lastSavedAt) this.savePosition(el.currentTime);
    });
    on('playing', () => {
      if (!mine()) return;
      if (el === this.audioEl) this.noteReadable(el.getAttribute('src'));
      this.failures = 0;
      this.startedLoaded = true;
      this.quiet();
      this.set({ status: 'playing', error: null, liveSince: this.current?.live ? this.state.liveSince ?? Date.now() : null });
    });
    on('pause', () => {
      if (!mine() || el.ended) return;
      // Loading a new stream pauses the element too; a live item still wanted keeps waiting (and its silence
      // check), only a pause asked for stops it.
      if (this.current?.live && this.wantPlay) { this.set({ status: 'loading' }); return; }
      this.quiet();
      this.savePosition(el.currentTime);
      this.set({ status: this.state.status === 'error' ? 'error' : 'paused' });
    });
    on('waiting', () => {
      if (!mine() || !this.wantPlay) return;
      this.set({ status: 'loading' });
      if (this.current?.live) this.listenForSilence();
    });
    on('ended', () => { if (mine()) this.onEnded(); });
    on('error', () => {
      if (!mine() || (this.hls && this.hls.el === el)) return; // hls.js reports its own
      // LL1-2: a file asked for with crossOrigin that never played is loaded again at once without it; not a failure.
      const url = el.getAttribute('src');
      if (el === this.audioEl && url && url === this.asking && !this.startedLoaded) {
        this.asking = null;
        this.retried = url;
        el.crossOrigin = null;
        el.src = url;
        if (this.wantPlay) this.start(el);
        return;
      }
      this.onError();
    });
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
    // Each queue label has its own saved speed (podcasts fast, music at 1×): switching modes restores it.
    const rate = validRate(Number(read(rateKey(label)))) ?? 1;
    // A newly opened playlist starts in its normal order.
    this.natural = items;
    this.set({ queue: items, index, label, rate, shuffle: false, position: 0, duration: 0, error: null });
    this.loadCurrent(autoplay);
  }

  // Replace the queue behind the current item without interrupting it (the list
  // grows as relays answer). Keeps playing the same item when it is still there.
  updateQueue(items: MediaItem[], label: string): void {
    const playing = this.current;
    if (!playing) return;
    const at = items.findIndex(i => i.id === playing.id);
    if (at < 0) return; // the item is not in this list: leave the queue alone
    this.natural = items;
    if (this.state.shuffle) {
      const merged = mergeShuffled(this.state.queue, items, playing.id);
      this.set({ queue: merged.queue, index: merged.index, label });
      return;
    }
    this.set({ queue: items, index: at, label });
  }

  // Shuffle on / off for the open playlist; the item playing keeps playing either way.
  toggleShuffle = (): void => {
    const currentId = this.current?.id;
    if (this.state.queue.length === 0) return;
    const next = this.state.shuffle ? unshuffle(this.natural, currentId) : shuffleAround(this.state.queue, currentId);
    if (next.index < 0 && currentId) return; // the playing item is not in the normal order any more: keep things as they are
    this.set({ queue: next.queue, index: next.index, shuffle: !this.state.shuffle });
  };

  private loadCurrent(play: boolean, at?: number): void {
    const item = this.current;
    const el = this.elementFor(item);
    this.wantPlay = play;
    this.pendingSeek = at !== undefined && Number.isFinite(at) && at > 0 ? at : null;
    // Moving on from an item that played marks it played for this session (spec §Added later). A hand-over
    // between the video and the hidden audio reloads the same item, which is not moving on.
    if (this.loadedId !== (item?.id ?? null)) {
      // A station is not "played": it stays in the list after you listen (feat-radio, How it plays).
      if (this.loadedId && this.startedLoaded && !this.loadedLive) played.add(this.loadedId);
      this.loadedId = item?.id ?? null;
      this.loadedLive = !!item?.live;
      this.startedLoaded = false;
      this.set({ liveSince: null });
    }
    this.quiet();
    for (const other of [this.audioEl, this.videoEl]) {
      if (other && other !== el) { other.pause(); }
    }
    if (!item || !el) {
      this.set({ status: item ? 'paused' : 'idle' });
      return;
    }
    if (item.kind === 'video') this.rememberVideo(item, Number(read(POS_PREFIX + item.url)) || 0);
    this.lastSavedAt = 0;
    if (this.hls && (this.hls.url !== item.url || this.hls.el !== el)) this.dropHls();
    if (item.live && isHls(item.url) && !el.canPlayType('application/vnd.apple.mpegurl')) {
      this.playHls(el, item, play);
      return;
    }
    if (el.getAttribute('src') !== item.url) {
      this.askToRead(el, item.url);
      el.src = item.url;
    } else if (this.pendingSeek !== null && el.readyState >= 1) {
      // Same file already loaded, so no new 'loadedmetadata': jump to the hand-over second now.
      el.currentTime = this.pendingSeek;
      this.pendingSeek = null;
    }
    el.playbackRate = item.live ? 1 : this.state.rate;
    this.set({ status: play ? 'loading' : 'paused', position: 0, duration: 0, error: null });
    if (play && item.live) this.listenForSilence();
    if (play) this.start(el);
  }

  // --- reading the sound (feat-lava-lamp LL1) ---------------------------------------------------------------
  // Only the hidden <audio>: ask to read another site's file unless its host is known to refuse.
  private askToRead(el: HTMLMediaElement, url: string): void {
    this.retried = null;
    if (el !== this.audioEl) { this.asking = null; return; }
    const ask = askToRead(url, typeof location === 'undefined' ? '' : location.origin, this.readable);
    el.crossOrigin = ask ? 'anonymous' : null;
    this.asking = ask ? url : null;
  }

  // It played: asked and played means the host allows reading; played only after the retry means it refuses.
  private noteReadable(url: string | null): void {
    const ok = url !== null && url === this.asking;
    const refused = url !== null && url === this.retried;
    this.asking = null;
    this.retried = null;
    if (!ok && !refused) return;
    const host = crossHost(url, typeof location === 'undefined' ? '' : location.origin);
    if (!host || this.readable.get(host) === ok) return;
    this.readable = remember(this.readable, host, ok);
    write(READABLE_KEY, serializeMemory(this.readable));
  }

  // --- live items (feat-radio §RA3) ------------------------------------------------------------
  // No sound within 10 s of asking, or 10 s stuck waiting: "Station not answering", and on to the next.
  private listenForSilence(): void {
    this.quiet();
    this.silentTimer = setTimeout(() => {
      this.silentTimer = null;
      if (this.current?.live && this.wantPlay && this.state.status !== 'playing') this.onError(NOT_ANSWERING);
    }, START_TIMEOUT_MS);
  }

  private quiet(): void {
    if (this.silentTimer !== null) clearTimeout(this.silentTimer);
    this.silentTimer = null;
  }

  private dropHls(): void {
    const h = this.hls;
    this.hls = null;
    if (!h) return;
    h.player.destroy();
    h.el.removeAttribute('src');
    h.el.load();
  }

  private playHls(el: HTMLMediaElement, item: MediaItem, play: boolean): void {
    this.set({ status: play ? 'loading' : 'paused', position: 0, duration: 0, error: null });
    if (play) this.listenForSilence();
    if (this.hls) { if (play) this.start(el); return; } // this stream is already attached
    void loadHls().then(Hls => {
      if (this.current?.id !== item.id || this.elementFor(item) !== el) return; // moved on while it loaded
      if (!Hls || !Hls.isSupported()) { this.onError(NOT_ANSWERING); return; }
      const h = new Hls({ lowLatencyMode: false });
      h.on(Hls.Events.ERROR, (_e, data) => { if (data.fatal && this.hls?.player === h) this.onError(NOT_ANSWERING); });
      this.hls = { el, url: item.url, player: h };
      h.attachMedia(el);
      h.loadSource(item.url);
      el.playbackRate = 1;
      if (this.wantPlay) this.start(el);
    });
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
    if (item?.live) { this.onError(NOT_ANSWERING); return; } // a station that stops
    if (item) played.add(item.id);
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

  private onError(liveText?: string): void {
    this.quiet();
    const live = this.current?.live;
    this.failures += 1;
    const next = nextIndex(this.state.index, this.state.queue.length);
    if (this.failures >= this.state.queue.length || next === null) {
      this.wantPlay = false;
      this.dropHls();
      this.audioEl?.pause();
      this.set({ status: 'error', error: live ? liveText ?? NOT_ANSWERING : 'Could not play this item' });
      return;
    }
    // Skip the broken item; give up once every item in a row has failed.
    this.set({ index: next, error: live ? liveText ?? NOT_ANSWERING : 'Skipped an item that would not play' });
    this.loadCurrent(true);
  }

  // --- transport ------------------------------------------------------------------------
  play = (): void => {
    const el = this.elementFor(this.current);
    if (!el) return;
    this.wantPlay = true;
    if (!el.getAttribute('src') && !this.hls) this.loadCurrent(true);
    else {
      if (this.current?.live) this.listenForSilence();
      this.start(el);
    }
  };

  pause = (): void => {
    this.wantPlay = false;
    this.quiet();
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
    if (this.current?.live) { // nothing to restart on a live stream: the previous station
      if (this.state.index > 0) { this.set({ index: this.state.index - 1 }); this.loadCurrent(true); }
      return;
    }
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
    if (!el || !Number.isFinite(seconds) || this.current?.live) return; // a live stream has nothing to seek
    const max = Number.isFinite(el.duration) ? el.duration : seconds;
    el.currentTime = Math.min(Math.max(0, seconds), max);
  };

  seekBy = (delta: number): void => {
    const el = this.elementFor(this.current);
    if (el) this.seek(el.currentTime + delta);
  };

  cycleRate = (): void => {
    if (this.current?.live) return;
    const rate = nextRate(this.state.rate);
    if (this.audioEl) this.audioEl.playbackRate = rate;
    if (this.videoEl) this.videoEl.playbackRate = rate;
    this.set({ rate });
    // The speed belongs to the kind of queue that is playing (Music, Podcasts, …), so the next
    // queue of the same kind starts at this speed again.
    if (this.state.label) write(rateKey(this.state.label), String(rate));
  };

  // --- persistence ------------------------------------------------------------------------
  private savePosition(position: number): void {
    const item = this.current;
    if (!item || item.live || !Number.isFinite(position)) return;
    this.lastSavedAt = position;
    write(POS_PREFIX + item.url, String(Math.floor(position)));
    if (item.kind === 'video') this.rememberVideo(item, position);
  }

  private rememberVideo(item: MediaItem, position: number): void {
    const duration = this.state.duration > 0 ? Math.floor(this.state.duration) : undefined;
    write(LAST_VIDEO, JSON.stringify({ item, position: Math.floor(position), duration }));
  }

  dispose(): void {
    this.cleanups.forEach(fn => fn());
    this.cleanups = [];
    this.attached = new WeakSet();
  }
}

export const player = new PlayerStore();

export function usePlayer(): PlayerState {
  return useSyncExternalStore(player.subscribe, player.getSnapshot, player.getSnapshot);
}
