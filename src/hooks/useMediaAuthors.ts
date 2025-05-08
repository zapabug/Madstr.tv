import { useState, useEffect, useMemo } from 'react';
import NDK, { NDKFilter, NDKKind, NDKSubscription, NDKEvent } from '@nostr-dev-kit/ndk';
import { TV_PUBKEY_NPUB } from '../constants'; // Assuming TV_PUBKEY_NPUB is in constants
// import { RELAYS } from '../constants'; // RELAYS not used
import * as nip19 from 'nostr-tools/nip19';

// Utility to convert npub to hex, moved from useAuth or defined locally if small
// const getHexPubkey = (npub: string): string | null => {
//   try {
//     const decoded = nip19.decode(npub);
//     if (decoded.type === 'npub') {
//       return decoded.data as string;
//     }
//   } catch (e) {
//     console.error(`Error decoding npub ${npub}:`, e);
//   }
//   return null;
// };

// Define props for the hook
interface UseMediaAuthorsProps {
    ndk?: NDK;
    isReady: boolean;
    loggedInUserNpub?: string | null; // New optional prop
}

interface MediaAuthorsState {
    mediaAuthors: string[];
    isLoadingAuthors: boolean;
}

const AUTHOR_FETCH_TIMEOUT = 15000; // 15 seconds timeout

export const useMediaAuthors = ({ ndk, isReady, loggedInUserNpub }: UseMediaAuthorsProps): MediaAuthorsState => {
    const [mediaAuthors, setMediaAuthors] = useState<string[]>([]);
    const [isLoadingAuthors, setIsLoadingAuthors] = useState<boolean>(true);

    const targetNpubForKind3 = useMemo(() => loggedInUserNpub || TV_PUBKEY_NPUB, [loggedInUserNpub]);

    const pubkey = useMemo(() => {
        if (!targetNpubForKind3) return null;
        try {
            return nip19.decode(targetNpubForKind3).data as string;
        } catch (e) {
            console.error(`Error decoding targetNpubForKind3 (${targetNpubForKind3}):`, e);
            return null;
        }
    }, [targetNpubForKind3]);

    useEffect(() => {
        console.log("useMediaAuthors: Effect running/re-running.");
        let sub: NDKSubscription | null = null;
        let timeoutId: NodeJS.Timeout | null = null;

        if (!ndk || !isReady || !pubkey) {
            console.log(`useMediaAuthors: Skipping fetch - ndk: ${!!ndk}, isReady: ${isReady}, pubkey: ${!!pubkey}`);
            if (isLoadingAuthors) setIsLoadingAuthors(false);
            if (!isLoadingAuthors && mediaAuthors.length === 0) {
                console.log("useMediaAuthors: Setting default author because fetch was skipped and state is empty.");
                setMediaAuthors(pubkey ? [pubkey] : [TV_PUBKEY_NPUB]);
            }
            return;
        }

        if (!isLoadingAuthors) setIsLoadingAuthors(true);

        const authorsFilter: NDKFilter = {
            kinds: [NDKKind.Contacts],
            authors: [pubkey],
            limit: 1,
        };

        console.log("useMediaAuthors: Subscribing to authors list...", authorsFilter);

        sub = ndk.subscribe(authorsFilter, { closeOnEose: true });

        timeoutId = setTimeout(() => {
            console.warn("useMediaAuthors: Timeout fetching authors list after 15s");
            sub?.stop();
            if (isLoadingAuthors) {
                setMediaAuthors(pubkey ? [pubkey] : [TV_PUBKEY_NPUB]);
                setIsLoadingAuthors(false);
            }
        }, AUTHOR_FETCH_TIMEOUT);

        sub.on('event', (event: NDKEvent) => {
            console.log("useMediaAuthors: Received kind 3 event:", event.id);
            if (timeoutId) clearTimeout(timeoutId);
            timeoutId = null;

            try {
                const followedPubkeys = event.tags
                    .filter((tag: string[]) => tag[0] === 'p' && tag[1])
                    .map((tag: string[]) => tag[1]);

                const allAuthors = Array.from(new Set(pubkey ? [pubkey, ...followedPubkeys] : followedPubkeys));

                console.log(`useMediaAuthors: Found ${followedPubkeys.length} followed pubkeys. Total authors: ${allAuthors.length}`);
                console.log("[useMediaAuthors] Setting authors:", allAuthors);
                setMediaAuthors(allAuthors);
                setIsLoadingAuthors(false);
            } catch (e) {
                console.error("useMediaAuthors: Error processing kind 3 event:", e);
                setMediaAuthors(pubkey ? [pubkey] : [TV_PUBKEY_NPUB]);
                setIsLoadingAuthors(false);
            }
        });

        sub.on('eose', () => {
            console.log("useMediaAuthors: Subscription EOSE received.");
            if (timeoutId) clearTimeout(timeoutId);
            timeoutId = null;
            if (isLoadingAuthors) {
                console.log("useMediaAuthors: No kind 3 event found before EOSE. Setting default author.");
                setMediaAuthors(pubkey ? [pubkey] : [TV_PUBKEY_NPUB]);
                setIsLoadingAuthors(false);
            }
        });

        return () => {
            console.log("useMediaAuthors: Cleaning up subscription and timeout.");
            if (sub) {
                sub.stop();
            }
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
        };
    }, [ndk, pubkey, isReady]);

    return { mediaAuthors, isLoadingAuthors };
}; 