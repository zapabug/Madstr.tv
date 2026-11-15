// The Android app's media controls (spec feat-android-native §N1): the page player's state goes to the
// native media session and notification (Playback plugin); their buttons and the media keys come back as
// actions. Loaded only in the app.
import { registerPlugin } from '@capacitor/core';
import { runAction } from '../lib/mediaActions.ts';
import { createNowPlayingBridge, type NowPlaying } from '../lib/nowPlaying.ts';
import { player } from '../lib/player.ts';

interface PlaybackPlugin {
  update(_now: NowPlaying): Promise<void>;
  end(): Promise<void>;
  addListener(_event: 'action', _fn: (_data: { action?: unknown; position?: unknown }) => void): Promise<{ remove: () => Promise<void> }>;
}

const Playback = registerPlugin<PlaybackPlugin>('Playback');
const warn = (error: unknown) => { console.error('[nowPlaying]', error); };

export function startNativeControls(): void {
  const bridge = createNowPlayingBridge({
    show: now => { Playback.update(now).catch(warn); },
    end: () => { Playback.end().catch(warn); },
    setTimer: (fn, ms) => window.setTimeout(fn, ms),
    clearTimer: handle => { window.clearTimeout(handle as number); },
    now: () => Date.now(),
  });
  Playback.addListener('action', data => { runAction(player, data.action, data.position); }).catch(warn);
  player.subscribe(() => bridge.update(player.getSnapshot()));
  bridge.update(player.getSnapshot());
}
