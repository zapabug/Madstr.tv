import { useMemo } from 'react';
import { castUser } from 'applesauce-common/casts';
import { FollowUser, UnfollowUser } from 'applesauce-actions/actions';
import type { Filter } from 'applesauce-core/helpers';
import { use$ } from 'applesauce-react/hooks';
import { accounts, actions } from '../lib/accounts.ts';
import { rankCreators, type Creator } from '../lib/creators.ts';
import { eventStore } from '../lib/applesauce.ts';
import { audioFromEvent, type MediaItem } from '../lib/media.ts';
import { TV_PUBKEY, useContacts, useRelayFeed } from './nostr.ts';

// The logged-in account, if any.
export function useAccount() {
  return use$(accounts.active$);
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

const CREATOR_FILTERS: Filter[] = [
  { kinds: [1063, 31337], limit: 300 },
  { kinds: [1], '#t': ['podcast', 'podcasts'], limit: 200 },
];

// Who is publishing audio on the relays that the feed account does not follow yet.
export function useCreatorSuggestions(): { creators: Creator[]; following: Set<string> | undefined } {
  const feed = useFeedPubkey();
  const contacts = useContacts(feed);
  useRelayFeed(CREATOR_FILTERS, 'creators');
  const events = use$(() => eventStore.timeline(CREATOR_FILTERS), []);

  return useMemo(() => {
    const following = contacts ? new Set(contacts) : undefined;
    const items: MediaItem[] = [];
    for (const event of events ?? []) {
      const item = audioFromEvent(event);
      if (item) items.push(item);
    }
    const exclude = new Set([...(following ?? []), feed]);
    return { creators: rankCreators(items, exclude), following };
  }, [events, contacts, feed]);
}
