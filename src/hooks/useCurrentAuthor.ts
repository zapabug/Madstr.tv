import { useState, useEffect } from 'react';
import { NostrNote } from '../types/nostr';
import { nip19 } from 'nostr-tools';

interface UseCurrentAuthorProps {
  viewMode: 'imagePodcast' | 'videoPlayer';
  imageIndex: number;
  videoIndex: number;
  imageNotes: NostrNote[];
  videoNotes: NostrNote[];
}

export const useCurrentAuthor = ({
  viewMode,
  imageIndex,
  videoIndex,
  imageNotes,
  videoNotes,
}: UseCurrentAuthorProps): string | null => {
  const [currentAuthorNpub, setCurrentAuthorNpub] = useState<string | null>(null);

  useEffect(() => {
    let activeNote: NostrNote | undefined;

    if (viewMode === 'imagePodcast' && imageNotes.length > 0) {
      activeNote = imageNotes[imageIndex];
    } else if (viewMode === 'videoPlayer' && videoNotes.length > 0) {
      activeNote = videoNotes[videoIndex];
    }

    if (activeNote?.pubkey) {
        try {
            const npub = nip19.npubEncode(activeNote.pubkey);
            setCurrentAuthorNpub(npub);
        } catch (e) {
            console.error("useCurrentAuthor: Error encoding pubkey:", e);
            setCurrentAuthorNpub(null);
        }
    } else {
        setCurrentAuthorNpub(null);
    }
  // Dependencies include everything used to determine the active note and its pubkey
  }, [viewMode, imageIndex, videoIndex, imageNotes, videoNotes]);

  return currentAuthorNpub;
}; 