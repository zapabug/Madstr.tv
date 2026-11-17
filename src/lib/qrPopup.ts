import { useSyncExternalStore } from 'react';

// Whether the TV's QR login pop-up is open (spec feat-tv-remote TV6), and whether this is a TV (<html data-tv>,
// set by the Android app on a TV, TVR-R4).
let open = false;
const listeners = new Set<() => void>();
function set(value: boolean): void {
  if (open === value) return;
  open = value;
  listeners.forEach(fn => fn());
}
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

export const qrPopup = { open: () => set(true), close: () => set(false) };

export function useQrPopup(): boolean {
  return useSyncExternalStore(subscribe, () => open, () => false);
}

export function isTv(): boolean {
  return typeof document !== 'undefined' && document.documentElement.hasAttribute('data-tv');
}
