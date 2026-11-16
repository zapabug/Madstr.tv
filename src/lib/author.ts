import type { MediaItem } from './media.ts';

// What the author spot in the media controls shows for the item that is playing:
//  - music or a post from Nostr: the account's profile image
//  - a podcast from an RSS feed: the show's cover (or its first letter when it has none)
//  - a local file: a folder placeholder
export type AuthorSpot =
  | { kind: 'profile'; pubkey: string; label: string }
  | { kind: 'cover'; image: string; label: string }
  | { kind: 'initial'; letter: string; label: string }
  | { kind: 'folder'; label: string }
  | { kind: 'none' };

export function authorSpot(item: MediaItem | undefined): AuthorSpot {
  if (!item) return { kind: 'none' };
  if (item.origin === 'local') return { kind: 'folder', label: 'Local file' };
  // A station or live show (feat-radio §RA3): its logo is the disc, not the importer's face.
  if (item.live) {
    const label = item.subtitle || 'Radio';
    return item.image ? { kind: 'cover', image: item.image, label } : { kind: 'initial', letter: item.title.slice(0, 1).toUpperCase(), label };
  }
  if (item.origin === 'rss') {
    const label = item.subtitle || 'Podcast';
    return item.image ? { kind: 'cover', image: item.image, label } : { kind: 'initial', letter: label.slice(0, 1).toUpperCase(), label };
  }
  if (item.pubkey) return { kind: 'profile', pubkey: item.pubkey, label: item.subtitle || 'Author' };
  return { kind: 'none' };
}
