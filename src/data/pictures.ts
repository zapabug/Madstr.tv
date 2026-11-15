import type { MediaItem } from '../lib/media.ts';
import { useOwn } from './ownContext.ts';
import { useContacts, useNostrItems } from './nostr.ts';
import { useFeedPubkey } from './people.ts';

const MAX_PICTURES = 300;

// What the slideshow shows. "mine" is only the pictures on this device; "all" adds the
// pictures posted by the people the feed account follows.
export function usePictures(scope: 'mine' | 'all'): MediaItem[] {
  const own = useOwn();
  const feed = useFeedPubkey();
  const contacts = useContacts(feed);
  const nostr = useNostrItems('image', scope === 'all' ? contacts : undefined);
  return scope === 'mine' ? own.pictures.slice(0, MAX_PICTURES) : [...own.pictures, ...nostr].slice(0, MAX_PICTURES);
}
