import { eventStore } from '../lib/applesauce.ts';
import { isLoggedIn, signAndPublish } from '../lib/accounts.ts';
import type { MediaItem } from '../lib/media.ts';
import { player } from '../lib/player.ts';
import { eventIdOf, likeTemplate, unlikeTemplate } from '../lib/reaction.ts';
import {
  getTaste, setTaste, withDownVote, withHiddenArtist, withHiddenSong, withUpVote, withoutVote,
} from '../lib/taste.ts';

// The vote and hide buttons on the media controls (spec feat-taste-cache §T2). Up votes are public likes when
// someone is logged in and the item is a Nostr post; everything else stays on this device.

const now = () => Math.floor(Date.now() / 1000);

/** Up vote, or take the up vote back. Resolves with a problem to show, or null. */
export async function toggleUpVote(item: MediaItem): Promise<string | null> {
  const taste = getTaste();
  const existing = taste.up[item.id];
  if (existing) {
    setTaste(t => withoutVote(t, item.id));
    if (existing.reaction && isLoggedIn()) {
      try { await signAndPublish(unlikeTemplate(existing.reaction, now())); }
      catch (error) { return `The like stays on Nostr: ${error instanceof Error ? error.message : String(error)}`; }
    }
    return null;
  }
  setTaste(t => withUpVote(t, item.id, Date.now()));
  const id = eventIdOf(item.id);
  const event = id ? eventStore.getEvent(id) : undefined;
  if (!event || !isLoggedIn()) return null; // kept on this device only
  try {
    const like = await signAndPublish(likeTemplate(event, now()));
    // Still up-voted (not taken back while signing): remember the like so it can be withdrawn.
    if (getTaste().up[item.id]) setTaste(t => withUpVote(t, item.id, Date.now(), like.id));
    return null;
  } catch (error) {
    return `Liked on this device only: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/** Down vote (private), or take it back. A down vote also withdraws a published like. */
export async function toggleDownVote(item: MediaItem): Promise<string | null> {
  const taste = getTaste();
  if (taste.down[item.id]) { setTaste(t => withoutVote(t, item.id)); return null; }
  const reaction = taste.up[item.id]?.reaction;
  setTaste(t => withDownVote(t, item.id, Date.now()));
  if (reaction && isLoggedIn()) {
    try { await signAndPublish(unlikeTemplate(reaction, now())); }
    catch (error) { return `The like stays on Nostr: ${error instanceof Error ? error.message : String(error)}`; }
  }
  return null;
}

// Hiding what is playing moves the player on first, so the list can drop it without stopping the music.
function moveOnFrom(item: MediaItem, gone: (_i: MediaItem) => boolean): void {
  if (player.current?.id !== item.id) return;
  const { queue, index } = player.getSnapshot();
  const next = queue.findIndex((q, i) => i > index && !gone(q));
  if (next >= 0) player.jump(next);
  else player.pause();
}

export function hideSong(item: MediaItem): void {
  moveOnFrom(item, q => q.id === item.id);
  setTaste(t => withHiddenSong(t, item, Date.now()));
}

export function hideArtist(item: MediaItem, name: string): void {
  const pubkey = item.pubkey;
  if (!pubkey) return;
  moveOnFrom(item, q => q.pubkey === pubkey);
  setTaste(t => withHiddenArtist(t, pubkey, name, Date.now()));
}
