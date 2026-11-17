import { useSyncExternalStore } from 'react';
import type { Point } from './cursor.ts';

// Whether the D-pad pointer is on, and where it is (spec feat-tv-remote TV7). The OK and text-box handlers ask
// cursorOn() so that, while it is on, OK clicks under the pointer instead of pressing the focused control.
let on = false;
let at: Point = { x: 0, y: 0 };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(fn => fn());

export function cursorOn(): boolean {
  return on;
}

export function cursorAt(): Point {
  return at;
}

export function setCursor(next: { on?: boolean; at?: Point }): void {
  if (next.on !== undefined) on = next.on;
  if (next.at) at = next.at;
  emit();
}

let snapshot = { on, at };
export function useCursor(): { on: boolean; at: Point } {
  return useSyncExternalStore(
    fn => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    () => {
      if (snapshot.on !== on || snapshot.at !== at) snapshot = { on, at };
      return snapshot;
    },
    () => snapshot,
  );
}
