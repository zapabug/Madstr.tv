// The browser's media controls (spec feat-android-native §N1, web): title, picture, previous / play-pause /
// next and seeking through navigator.mediaSession. Not used in the Android app, which has its own.
import { runAction, type MediaAction } from '../lib/mediaActions.ts';
import { createNowPlayingBridge, type NowPlaying } from '../lib/nowPlaying.ts';
import { isNativeApp } from '../lib/platform.ts';
import { player } from '../lib/player.ts';

const HANDLERS: [MediaSessionAction, MediaAction][] = [
  ['play', 'play'], ['pause', 'pause'], ['stop', 'stop'], ['previoustrack', 'previous'], ['nexttrack', 'next'],
  ['seekbackward', 'rewind'], ['seekforward', 'forward'],
];

function show(session: MediaSession, now: NowPlaying): void {
  try {
    session.metadata = new MediaMetadata({
      title: now.title,
      artist: now.subtitle,
      artwork: now.image ? [{ src: now.image }] : [],
    });
    session.playbackState = now.status === 'playing' || now.status === 'loading' ? 'playing' : 'paused';
    if (now.duration > 0 && 'setPositionState' in session) {
      session.setPositionState({ duration: now.duration, position: Math.min(now.position, now.duration), playbackRate: now.rate });
    }
  } catch (error) {
    console.error('[mediaSession]', error);
  }
}

export function startWebMediaSession(): void {
  if (isNativeApp() || typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
  const session = navigator.mediaSession;
  for (const [name, action] of HANDLERS) {
    try { session.setActionHandler(name, () => { runAction(player, action); }); } catch { /* not supported here */ }
  }
  try { session.setActionHandler('seekto', d => { runAction(player, 'seek', d.seekTime); }); } catch { /* not supported */ }
  const bridge = createNowPlayingBridge({
    show: now => show(session, now),
    end: () => { session.metadata = null; session.playbackState = 'none'; },
    setTimer: (fn, ms) => window.setTimeout(fn, ms),
    clearTimer: handle => { window.clearTimeout(handle as number); },
    now: () => Date.now(),
  });
  player.subscribe(() => bridge.update(player.getSnapshot()));
}
