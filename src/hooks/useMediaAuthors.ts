import { useEffect, useState } from 'react';
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
    ndk: NDK | undefined;
}

export function useMediaAuthors({ ndk }: UseMediaAuthorsProps) {
    const [mediaAuthors, setMediaAuthors] = useState<string[]>([]); // State for media authors
    const [isLoadingAuthors, setIsLoadingAuthors] = useState<boolean>(true); // Loading state for authors

    // Effect to Connect NDK and Subscribe to Kind 3 List
    useEffect(() => {
        if (!ndk) {
            console.log("useMediaAuthors: NDK (passed as prop) not ready yet.");
            if (isLoadingAuthors) setIsLoadingAuthors(false);
            return;
        }

        let sub: NDKSubscription | null = null; // Keep track of the subscription
        let foundKind3Event = false; // Flag to track if event was found

        const fetchKind3List = async () => {
            console.log("useMediaAuthors: NDK instance provided, attempting to subscribe to Kind 3.");
            try {
                // Removed: await ndk.connect(); - Connection handled in App.tsx
                console.log("useMediaAuthors: Subscribing to Kind 3 list...");

                const tvPubkeyHex = getHexPubkey(TV_PUBKEY_NPUB);
                if (!tvPubkeyHex) {
                    console.error("useMediaAuthors: Invalid TV_PUBKEY_NPUB, cannot fetch authors.");
                    setIsLoadingAuthors(false);
                    return;
                }

                console.log(`useMediaAuthors: Subscribing to Kind 3 contact list for ${tvPubkeyHex}...`);
                setIsLoadingAuthors(true); // Set loading before subscribing

                const filter: NDKFilter = { kinds: [3], authors: [tvPubkeyHex], limit: 1 };
                sub = ndk.subscribe(filter, { closeOnEose: false });

                sub.on('event', (kind3Event: NDKEvent) => {
                    if (foundKind3Event) return;

                    foundKind3Event = true;
                    console.log("useMediaAuthors: Found Kind 3 event:", kind3Event.rawEvent());
                    const followed = kind3Event.tags
                        .filter(tag => tag[0] === 'p' && tag[1])
                        .map(tag => tag[1]); // These are hex pubkeys
                    const authors = Array.from(new Set([tvPubkeyHex, ...followed]));
                    console.log(`useMediaAuthors: Setting media authors (TV + follows):`, authors);
                    setMediaAuthors(authors);
                    setIsLoadingAuthors(false);
                    sub?.stop();
                });

                sub.on('eose', () => {
                    console.log("useMediaAuthors: Kind 3 subscription EOSE received.");
                    if (!foundKind3Event) {
                        console.warn("useMediaAuthors: No Kind 3 event found for TV pubkey after EOSE.");
                        setMediaAuthors([]); // Set to empty if no Kind 3 found
                        setIsLoadingAuthors(false);
                    }
                });

                 sub.on('closed', () => {
                    console.log("useMediaAuthors: Kind 3 subscription closed.");
                    if (isLoadingAuthors && !foundKind3Event) {
                         console.warn("useMediaAuthors: Kind 3 subscription closed before event or EOSE.");
                         setMediaAuthors([]);
                         setIsLoadingAuthors(false);
                    }
                });

            } catch (err) {
                console.error("useMediaAuthors: NDK Connection or Kind 3 Subscription Error", err);
                setIsLoadingAuthors(false);
            }
        };

        fetchKind3List();

        // Cleanup function
        return () => {
          console.log("useMediaAuthors: Cleaning up Kind 3 subscription...");
          sub?.stop();
        };

    }, [ndk, isLoadingAuthors]);

    // Return only the state needed by App.tsx
    return { mediaAuthors, isLoadingAuthors };
} 