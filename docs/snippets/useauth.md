import React, { useState, useEffect, useCallback, useRef } from 'react';
import NDK, { NDKPrivateKeySigner, NDKNip46Signer, NDKUser, NostrEvent } from '@nostr-dev-kit/ndk';
import * as nip19 from 'nostr-tools/nip19';
import * as nip04 from 'nostr-tools/nip04'; // For DMs if needed
import { getPublicKey, generateSecretKey } from 'nostr-tools/pure'; // For key utils

// Define the return type for type safety and clarity
export interface UseAuthReturn {
    currentUserNpub: string | null;
    isLoggedIn: boolean;
    isLoadingAuth: boolean;
    authError: string | null;
    loginWithNsec: (nsec: string) => Promise<boolean>;
    initiateNip46Connection: () => Promise<void>; // Start NIP-46 flow
    cancelNip46Connection: () => void; // Cancel NIP-46 flow
    logout: () => Promise<void>;
    nip46ConnectUri: string | null; // The bunker:// URI to display
    isGeneratingUri: boolean;
    getNdkSigner: () => NDKPrivateKeySigner | NDKNip46Signer | undefined;
    // Add other methods/state as needed (e.g., encrypt/decrypt DM)
}

// Timeout for waiting for NIP-46 connection
const NIP46_CONNECT_TIMEOUT = 75000; // 75 seconds

// The hook itself
export const useAuth = (ndkInstance: NDK | undefined): UseAuthReturn => {
    const [currentUserNpub, setCurrentUserNpub] = useState<string | null>(null);
    const [currentUserNsec, setCurrentUserNsec] = useState<string | null>(null); // If supporting nsec login
    const [nip46SignerPubkey, setNip46SignerPubkey] = useState<string | null>(null); // Hex pubkey of connected NIP-46 signer
    const [isLoadingAuth, setIsLoadingAuth] = useState<boolean>(true);
    const [authError, setAuthError] = useState<string | null>(null);

    // Refs and state specifically for NIP-46 connection process
    const nip46TempPrivKeyRef = useRef<Uint8Array | null>(null); // Temporary key for bunker URI
    const nip46SubscriptionRef = useRef<any | null>(null); // NDKSubscription type might vary
    const nip46TimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const [nip46ConnectUri, setNip46ConnectUri] = useState<string | null>(null);
    const [isGeneratingUri, setIsGeneratingUri] = useState<boolean>(false);

    // Memoized derived state
    const isLoggedIn = useMemo(() => !!(currentUserNpub && (currentUserNsec || nip46SignerPubkey)), [currentUserNpub, currentUserNsec, nip46SignerPubkey]);

    // Placeholder signer instance, will be updated on login
    const activeSignerRef = useRef<NDKPrivateKeySigner | NDKNip46Signer | undefined>(undefined);

    // --- NIP-46 Connection Logic ---
    const initiateNip46Connection = useCallback(async () => {
        // ... (Implementation in Snippet 4) ...
    }, [ndkInstance]);

    const cleanupNip46Attempt = useCallback(() => {
         // ... (Implementation in Snippet 5) ...
    }, [ndkInstance]);

    const cancelNip46Connection = useCallback(() => {
        cleanupNip46Attempt();
        setAuthError("NIP-46 connection cancelled.");
    }, [cleanupNip46Attempt]);

    // --- Login / Logout Logic ---
    const loginWithNsec = useCallback(async (nsec: string): Promise<boolean> => {
         // ... (Implementation for nsec if needed) ...
         return false; // Placeholder
    }, []); // Add dependencies

    const logout = useCallback(async () => {
        console.log("Logging out...");
        setCurrentUserNpub(null);
        setCurrentUserNsec(null);
        setNip46SignerPubkey(null);
        setAuthError(null);
        cleanupNip46Attempt(); // Clean up any pending NIP-46 stuff
        activeSignerRef.current = undefined;
        if (ndkInstance) {
            ndkInstance.signer = undefined; // Clear signer from NDK instance
        }
        // Clear persisted data (e.g., from localStorage or IndexedDB)
        // await idb.clearNsecFromDb();
        // await idb.clearNip46SignerPubkeyFromDb();
        console.log("User logged out.");
    }, [ndkInstance, cleanupNip46Attempt]); // Add persistence clear functions if used

    // --- Signer Management ---
    const getNdkSigner = useCallback(() => {
        return activeSignerRef.current;
    }, []);

    // --- Initialization Effect ---
    useEffect(() => {
        const initializeAuth = async () => {
            setIsLoadingAuth(true);
            if (!ndkInstance) {
                console.log("useAuth: NDK instance not ready yet.");
                // Optional: Keep loading until NDK is ready, or handle gracefully
                // setIsLoadingAuth(false); // Or maybe keep true until NDK is ready?
                return;
            }

            // Try to load persisted session (NIP-46 first, then nsec)
            // Example using localStorage, adapt if using IndexedDB (like the original hook)
            const persistedNip46Pk = localStorage.getItem('nip46SignerPubkey'); // Store HEX pubkey
            const persistedNsec = localStorage.getItem('currentUserNsec');

            let loggedIn = false;
            if (persistedNip46Pk) {
                try {
                    // Recreate NIP-46 signer - IMPORTANT: This usually requires user interaction again
                    // or storing the bunker URI payload securely. Simply storing the pubkey
                    // is NOT enough to re-establish the signer without user action or payload.
                    // For simplicity here, we just set the pubkey state. A real app needs
                    // to handle re-establishing the connection (often by re-prompting).
                    console.warn("Restoring NIP-46 session from pubkey only - Requires re-connection logic!");
                    setNip46SignerPubkey(persistedNip46Pk);
                    setCurrentUserNpub(nip19.npubEncode(persistedNip46Pk));
                    // ndkInstance.signer = ???; // Cannot recreate signer from pubkey alone
                    loggedIn = true; // Assume logged in, but signer needs re-establishment
                 } catch (e) {
                     console.error("Error restoring NIP-46 session:", e);
                     localStorage.removeItem('nip46SignerPubkey');
                 }
            } else if (persistedNsec) {
                // Restore nsec session
                try {
                     const decoded = nip19.decode(persistedNsec);
                     if (decoded.type === 'nsec') {
                         const pkHex = getPublicKey(decoded.data as Uint8Array);
                         const nsecSigner = new NDKPrivateKeySigner(decoded.data as Uint8Array);
                         ndkInstance.signer = nsecSigner;
                         activeSignerRef.current = nsecSigner;
                         setCurrentUserNsec(persistedNsec);
                         setCurrentUserNpub(nip19.npubEncode(pkHex));
                         setNip46SignerPubkey(null);
                         console.log("Restored session with nsec:", nip19.npubEncode(pkHex));
                         loggedIn = true;
                     } else {
                         localStorage.removeItem('currentUserNsec');
                     }
                } catch(e) {
                     console.error("Error restoring nsec session:", e);
                     localStorage.removeItem('currentUserNsec');
                }
            }

            setIsLoadingAuth(false);
        };

        initializeAuth();

        // Cleanup on unmount
        return () => {
            cleanupNip46Attempt();
        };
    }, [ndkInstance, cleanupNip46Attempt]); // Dependency on NDK instance

    // --- Return hook state and methods ---
    return {
        currentUserNpub,
        isLoggedIn,
        isLoadingAuth,
        authError,
        loginWithNsec,
        initiateNip46Connection,
        cancelNip46Connection,
        logout,
        nip46ConnectUri,
        isGeneratingUri,
        getNdkSigner,
        // ... other returned values
        currentUserNsec: null, // Don't expose nsec by default unless necessary
    };
};
