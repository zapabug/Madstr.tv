import type { MediaItem } from '../lib/media.ts';
import { useContacts, useNostrItems } from './nostr.ts';
import { useFeedPubkey } from './people.ts';

const MAX_PICTURES = 300;

// What the slideshow shows: pictures posted by the people the feed account follows.
// (Your own local pictures join this list in a later step.)
export function usePictures(): MediaItem[] {
  const feed = useFeedPubkey();
  const contacts = useContacts(feed);
  const images = useNostrItems('image', contacts);
  return images.slice(0, MAX_PICTURES);
}
