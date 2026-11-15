import type { MediaItem } from '../lib/media.ts';
import { useOwn } from './ownContext.ts';
import { useContacts, useNostrItems } from './nostr.ts';
import { useFeedPubkey } from './people.ts';
import { useTagSet } from '../lib/tags.ts';

const MAX_PICTURES = 300;

// The two sources of slideshow pictures: yours (the folders you added) and the others (posted by the people
// the feed account follows, and your picture hashtags). How they are mixed is the picture mix setting.
export interface PictureSources {
  mine: MediaItem[];
  others: MediaItem[];
}

// "mine" is the My pictures view: only the pictures on this device. "all" adds the Nostr ones.
export function usePictures(scope: 'mine' | 'all'): PictureSources {
  const own = useOwn();
  const feed = useFeedPubkey();
  const contacts = useContacts(feed);
  const tags = useTagSet();
  const nostr = useNostrItems('image', scope === 'all' ? contacts : undefined, scope === 'all' ? tags.image : []);
  return { mine: own.pictures.slice(0, MAX_PICTURES), others: scope === 'all' ? nostr.slice(0, MAX_PICTURES) : [] };
}
