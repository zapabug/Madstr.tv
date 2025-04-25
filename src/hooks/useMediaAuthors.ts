import { useState, useEffect, useMemo } from 'react';
import { nip19 } from 'nostr-tools';
import NDK, { NDKEvent, NDKFilter, NDKSubscription } from '@nostr-dev-kit/ndk';
import { RELAYS } from '../constants'; // Adjust path as needed
import { TV_PUBKEY_NPUB } from '../constants'; // Import separately if needed or combine if exported

// Function to safely decode npub (moved from App.tsx)
function getHexPubkey(npub: string): string | null {
    try {
        const decoded = nip19.decode(npub);
        if (decoded.type === 'npub') {
            return decoded.data;
        }
        console.warn(`useMediaAuthors: Decoded type is not npub: ${decoded.type}`);
        return null;
    } catch (e) {
        console.error(`useMediaAuthors: Failed to decode npub ${npub}:`, e);
        return null;
    }
}

// Define props for the hook
interface UseMediaAuthorsProps {
    ndk?: NDK;
    isReady: boolean;
}

interface MediaAuthorsState {
    mediaAuthors: string[];
    isLoadingAuthors: boolean;
}

const AUTHOR_FETCH_TIMEOUT = 15000; // 15 seconds timeout

export const useMediaAuthors = ({ ndk, isReady }: UseMediaAuthorsProps): MediaAuthorsState => {
    const [mediaAuthors, setMediaAuthors] = useState<string[]>([]);
    const [isLoadingAuthors, setIsLoadingAuthors] = useState<boolean>(true);

    const pubkey = useMemo(() => {
        try {
            return nip19.decode(TV_PUBKEY_NPUB).data as string;
        } catch (e) {
            console.error("Error decoding TV_PUBKEY_NPUB:", e);
            return null;
        }
    }, []);

    useEffect(() => {
        console.log("useMediaAuthors: Effect running/re-running.");
        let sub: NDKSubscription | null = null;
        let timeoutId: NodeJS.Timeout | null = null;

        if (!ndk || !isReady || !pubkey) {
            console.log(`useMediaAuthors: Skipping fetch - ndk: ${!!ndk}, isReady: ${isReady}, pubkey: ${!!pubkey}`);
            if (isLoadingAuthors) setIsLoadingAuthors(false);
            if (!pubkey && mediaAuthors.length === 0) setMediaAuthors([TV_PUBKEY_NPUB]);
            return;
        }

        if (!isLoadingAuthors) setIsLoadingAuthors(true);

        const authorsFilter: NDKFilter = {
            kinds: [3],
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
                    .filter(tag => tag[0] === 'p' && tag[1])
                    .map(tag => tag[1]);

                const allAuthors = Array.from(new Set([pubkey, ...followedPubkeys]));

                console.log(`useMediaAuthors: Found ${followedPubkeys.length} followed pubkeys. Total authors: ${allAuthors.length}`);
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