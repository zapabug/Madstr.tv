// What a system media control does to the page's player (spec feat-android-native §N1): the lock screen,
// notification, headphone and remote keys on Android, and the browser's media keys on the web.
export const FORWARD_S = 30; // the same steps as the on-screen −10s / +30s buttons
export const REWIND_S = 10;

export type MediaAction = 'play' | 'pause' | 'toggle' | 'next' | 'previous' | 'seek' | 'forward' | 'rewind' | 'stop';
const ACTIONS: readonly string[] = ['play', 'pause', 'toggle', 'next', 'previous', 'seek', 'forward', 'rewind', 'stop'];

export interface Controllable {
  play(): void;
  pause(): void;
  toggle(): void;
  next(): void;
  prev(): void;
  seek(_seconds: number): void;
  seekBy(_delta: number): void;
}

// Unknown actions and bad positions (they cross a bridge) are ignored. Returns whether something ran.
export function runAction(player: Controllable, action: unknown, position?: unknown): boolean {
  if (typeof action !== 'string' || !ACTIONS.includes(action)) return false;
  switch (action as MediaAction) {
    case 'play': player.play(); return true;
    case 'pause': case 'stop': player.pause(); return true;
    case 'toggle': player.toggle(); return true;
    case 'next': player.next(); return true;
    case 'previous': player.prev(); return true;
    case 'forward': player.seekBy(FORWARD_S); return true;
    case 'rewind': player.seekBy(-REWIND_S); return true;
    case 'seek':
      if (typeof position !== 'number' || !Number.isFinite(position) || position < 0) return false;
      player.seek(position);
      return true;
  }
}
