// The Android app's background play (spec feat-android-play §A2): while the page player plays, the native
// PlaybackService runs, so Android does not freeze the app and the music goes on. Loaded only in the app.
import { registerPlugin } from '@capacitor/core';
import { createKeepAlive } from '../lib/keepAlive.ts';
import { player } from '../lib/player.ts';

interface PlaybackPlugin {
  start(_options: { title: string }): Promise<void>;
  stop(): Promise<void>;
}

const Playback = registerPlugin<PlaybackPlugin>('Playback');
const warn = (error: unknown) => { console.error('[backgroundPlay]', error); };

export function startBackgroundPlay(): void {
  const keepAlive = createKeepAlive({
    start: title => { Playback.start({ title }).catch(warn); },
    stop: () => { Playback.stop().catch(warn); },
    setTimer: (fn, ms) => window.setTimeout(fn, ms),
    clearTimer: handle => { window.clearTimeout(handle as number); },
  });
  const tick = () => {
    const s = player.getSnapshot();
    keepAlive.update(s.status, s.queue[s.index]?.title);
  };
  player.subscribe(tick);
  tick();
}
