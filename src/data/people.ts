import { useMemo } from 'react';
import { castUser } from 'applesauce-common/casts';
import { FollowUser, UnfollowUser } from 'applesauce-actions/actions';
import type { Filter } from 'applesauce-core/helpers';
import { use$ } from 'applesauce-react/hooks';
import { actions, useAccountState } from '../lib/accounts.ts';
import { friendsOfFollows, rankCreators, type Category, type Creator } from '../lib/creators.ts';
import { useProbedDurations } from '../lib/durations.ts';
import { eventStore } from '../lib/applesauce.ts';
import { audioFromEvent, imageFromEvent, videoFromEvent, type MediaItem } from '../lib/media.ts';
import { TV_PUBKEY, chunk, useContacts, useNostrItems, useRelayFeed } from './nostr.ts';
import { CONTACT_RELAYS } from '../lib/relays.ts';

// The logged-in account, if any.
export function useAccount(): { pubkey: string } | undefined {
  const state = useAccountState();
  return useMemo(() => (state.status === 'in' && state.pubkey ? { pubkey: state.pubkey } : undefined), [state.status, state.pubkey]);
}

// Whose follows feed the board: yours once you log in, the TV's until then.
export function useFeedPubkey(): string {
  return useAccount()?.pubkey ?? TV_PUBKEY;
}

export function useProfile(pubkey: string | undefined) {
  return use$(() => (pubkey ? castUser(pubkey, eventStore).profile$ : undefined), [pubkey]);
}

export function shortName(pubkey: string, name?: string): string {
  return name?.trim() || `${pubkey.slice(0, 8)}…`;
}

// Follow / unfollow through Applesauce's actions: they edit the account's existing
// contact list, so nothing is overwritten.
export async function follow(pubkey: string): Promise<void> {
  await actions.run(FollowUser, { pubkey });
}
export async function unfollow(pubkey: string): Promise<void> {
  await actions.run(UnfollowUser, { pubkey });
}

// What anyone is publishing right now, for the people who are not friends of your follows yet.
const CREATOR_FILTERS: Filter[] = [
  { kinds: [1063, 31337], limit: 300 },
  { kinds: [1], '#t': ['podcast', 'podcasts'], limit: 200 },
  { kinds: [21, 22, 34235, 34236], limit: 200 },
  { kinds: [20], limit: 200 },
];

// The people your follows follow (fetching each follow's contact list), with how many of your follows
// follow each of them. Quietly empty until the lists arrive.
function useFriendsOfFollows(contacts: string[] | undefined, exclude: ReadonlySet<string>): Map<string, number> {
  const key = contacts ? contacts.join(',') : '';
  const filters = useMemo<Filter[]>(() => chunk(contacts ?? [], 100).map(authors => ({ kinds: [3], authors, limit: authors.length })),
    // contacts is represented by its joined key
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key]);
  useRelayFeed(filters, `fof:${key}`, CONTACT_RELAYS);
  const events = use$(() => (filters.length > 0 ? eventStore.timeline(filters) : undefined), [key]);
  return useMemo(() => {
    const lists = (events ?? []).map(e => e.tags.filter(t => t[0] === 'p' && /^[0-9a-f]{64}$/.test(t[1] ?? '')).map(t => t[1]));
    return friendsOfFollows(lists, exclude);
  }, [events, exclude]);
}

// Who to follow next, ranked by what they publish: pictures, videos, podcasts, music and short videos
// (under 30 seconds). Friends of your follows come first (the more of your follows follow them, the
// higher), then others. Pick a category to see only people who publish it.
export function useCreatorSuggestions(category: Category | 'all' = 'all'): { creators: Creator[]; following: Set<string> | undefined } {
  const feed = useFeedPubkey();
  const contacts = useContacts(feed);
  const following = useMemo(() => (contacts ? new Set(contacts) : undefined), [contacts]);
  const exclude = useMemo(() => new Set([...(contacts ?? []), feed]), [contacts, feed]);

  const mutual = useFriendsOfFollows(contacts, exclude);
  const friendAuthors = useMemo(() => (mutual.size > 0 ? [...mutual.keys()] : undefined), [mutual]);
  const friendAudio = useProbedDurations(useNostrItems('audio', friendAuthors));
  const friendVideo = useNostrItems('video', friendAuthors);
  const friendImages = useNostrItems('image', friendAuthors);

  useRelayFeed(CREATOR_FILTERS, 'creators');
  const events = use$(() => eventStore.timeline(CREATOR_FILTERS), []);

  const creators = useMemo(() => {
    const items: MediaItem[] = [...friendAudio, ...friendVideo, ...friendImages];
    for (const event of events ?? []) {
      const item = audioFromEvent(event) ?? videoFromEvent(event) ?? imageFromEvent(event);
      if (item) items.push(item);
    }
    return rankCreators(items, exclude, 30, mutual, category);
  }, [friendAudio, friendVideo, friendImages, events, exclude, mutual, category]);

  return { creators, following };
}
