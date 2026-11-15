import type { ReactNode } from 'react';
import { OwnContext } from './ownContext.ts';
import { useOwnAudioState } from './ownAudioState.ts';

// Local folders and RSS feeds are loaded once for the whole app, so the viewer and
// the board's previews read the same lists (and the same object URLs).
export function OwnProvider({ children }: { children: ReactNode }) {
  const own = useOwnAudioState();
  return <OwnContext.Provider value={own}>{children}</OwnContext.Provider>;
}
