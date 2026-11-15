import { createContext, useContext } from 'react';
import type { OwnAudio } from './ownAudioState.ts';

export const OwnContext = createContext<OwnAudio | null>(null);

export function useOwn(): OwnAudio {
  const own = useContext(OwnContext);
  if (!own) throw new Error('useOwn needs <OwnProvider>');
  return own;
}
