import { useSyncExternalStore } from 'react';

// "Leave Juke⚡tr?" (spec feat-tv-remote TV3-4): on a TV, Back on the board asks before the app closes. The app's
// Back handler calls window.jukeAskLeave(); a second Back while it shows answers Stay.
let open = false;
const listeners = new Set<() => void>();

function set(value: boolean): void {
  if (open === value) return;
  open = value;
  listeners.forEach(fn => fn());
}

export const leavePrompt = {
  ask: () => set(!open),
  close: () => set(false),
  isOpen: () => open,
  subscribe: (fn: () => void) => {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },
};

export function useLeavePrompt(): boolean {
  return useSyncExternalStore(leavePrompt.subscribe, leavePrompt.isOpen, () => false);
}

declare global {
  interface Window { jukeAskLeave?: () => void }
}
if (typeof window !== 'undefined') window.jukeAskLeave = leavePrompt.ask;
