import { useEffect, useState, useRef } from 'react';
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
    const [mediaAuthors, setMediaAuthors] = useState<string[]>([]);
    const [isLoadingAuthors, setIsLoadingAuthors] = useState<boolean>(true);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        console.log("useMediaAuthors: Effect running/re-running.");

        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }

        if (!ndk) {
            console.log("useMediaAuthors: NDK instance not ready yet.");
            if (isLoadingAuthors) setIsLoadingAuthors(false);
            setMediaAuthors([]);
            return;
        }

        let sub: NDKSubscription | null = null;
        let foundKind3Event = false;
        setIsLoadingAuthors(true);

        const fetchKind3List = async () => {
            console.log("useMediaAuthors: NDK instance available, starting fetchKind3List.");
            try {
                const tvPubkeyHex = getHexPubkey(TV_PUBKEY_NPUB);
                if (!tvPubkeyHex) {
                    console.error("useMediaAuthors: Invalid TV_PUBKEY_NPUB, cannot fetch authors.");
                    setIsLoadingAuthors(false);
                    return;
                }

                console.log(`useMediaAuthors: Subscribing to Kind 3 for ${tvPubkeyHex}...`);
                
                const filter: NDKFilter = { kinds: [3], authors: [tvPubkeyHex], limit: 1 };
                sub = ndk.subscribe(filter, { closeOnEose: false });
                console.log("useMediaAuthors: NDK subscription initiated (closeOnEose: false). Sub ID:", sub.subId);

                sub.on('event', (kind3Event: NDKEvent) => {
                    console.log("useMediaAuthors: >>> Kind 3 EVENT received!", kind3Event.id);
                    if (foundKind3Event) {
                        console.log("useMediaAuthors: Kind 3 event ignored (already processed).");
                        return;
                    }
                    foundKind3Event = true;
                    if (timeoutRef.current) {
                         clearTimeout(timeoutRef.current);
                         timeoutRef.current = null;
                    }
                    const followed = kind3Event.tags
                        .filter(tag => tag[0] === 'p' && tag[1])
                        .map(tag => tag[1]);
                    const authors = Array.from(new Set([tvPubkeyHex, ...followed])); 
                    console.log(`useMediaAuthors: Setting mediaAuthors state with ${authors.length} authors.`, authors);
                    setMediaAuthors(authors);
                    setIsLoadingAuthors(false); 
                });

                sub.on('eose', () => {
                    console.log("useMediaAuthors: >>> Kind 3 EOSE received (subscription remains open)!");
                });

                 sub.on('closed', (reason) => {
                    console.log("useMediaAuthors: >>> Kind 3 subscription CLOSED. Reason:", reason);
                    if (isLoadingAuthors && !foundKind3Event) { 
                         console.warn("useMediaAuthors: Closed before event/timeout, setting loading false & default authors.");
                         const tvHex = getHexPubkey(TV_PUBKEY_NPUB);
                         setMediaAuthors(tvHex ? [tvHex] : []);
                         setIsLoadingAuthors(false);
                          if (timeoutRef.current) {
                            clearTimeout(timeoutRef.current);
                            timeoutRef.current = null;
                         }
                    }
                });

                console.log("useMediaAuthors: Setting timeout (15s) for Kind 3 fetch.");
                timeoutRef.current = setTimeout(() => {
                     console.log("useMediaAuthors: Timeout reached!");
                     timeoutRef.current = null;
                     if (!foundKind3Event) {
                         console.warn("useMediaAuthors: Timeout reached and no Kind 3 event found. Setting default authors.");
                         const tvHex = getHexPubkey(TV_PUBKEY_NPUB);
                         setMediaAuthors(tvHex ? [tvHex] : []);
                         setIsLoadingAuthors(false);
                         console.log("useMediaAuthors: Stopping subscription due to timeout.");
                         sub?.stop();
                     }
                 }, 15000);

            } catch (err) {
                console.error("useMediaAuthors: Error during Kind 3 Subscription call:", err);
                setIsLoadingAuthors(false);
            }
        };

        fetchKind3List();

        return () => {
          console.log("useMediaAuthors: Cleaning up Kind 3 subscription (effect re-run or unmount). Sub ID:", sub?.subId);
          if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
          }
          sub?.stop();
        };

    }, [ndk]);

    console.log("useMediaAuthors: Returning state", { isLoadingAuthors, mediaAuthors });
    return { mediaAuthors, isLoadingAuthors };
} 