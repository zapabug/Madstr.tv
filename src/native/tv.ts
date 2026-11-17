// The Android app on a TV (spec feat-tv-remote TVR-R4): the Tv plugin says whether the device is a TV, and
// closes the app when "Leave Juke⚡tr?" is answered Leave (TV3-4). Loaded only in the app.
import { registerPlugin } from '@capacitor/core';

interface TvPlugin {
  info(): Promise<{ tv?: boolean }>;
  leave(): Promise<void>;
}

const Tv = registerPlugin<TvPlugin>('Tv');

// Marks the page <html data-tv> on a TV, for the TV-only parts (layout, pop-ups).
export async function startTv(): Promise<void> {
  try {
    const { tv } = await Tv.info();
    if (tv === true) document.documentElement.dataset.tv = '';
  } catch (error) {
    console.error('[tv]', error);
  }
}

export function leaveApp(): Promise<void> {
  return Tv.leave();
}
