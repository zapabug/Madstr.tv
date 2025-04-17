import { useState, useEffect, useCallback } from 'react';
import * as nip19 from 'nostr-tools/nip19';
import * as nip46 from 'nostr-tools/nip46';
import { Buffer } from 'buffer';
import { getPublicKey } from 'nostr-tools/pure';
import { generatePrivateKey } from 'nostr-tools';
import NDK, { NDKPrivateKeySigner, NDKNip46Signer, NDKEvent, NDKFilter, NDKSubscriptionOptions, NostrEvent } from '@nostr-dev-kit/ndk';
import { idb, StoredNsecData } from '../utils/idb';

// Define the shape of the hook's return value
interface UseAuthReturn {
    currentUserNpub: string | null;
    currentUserNsec: string | null; // Exposed cautiously, primarily for internal use or backup
    isLoggedIn: boolean;
    isLoadingAuth: boolean;
    authError: string | null;
    nip46ConnectUri: string | null; // Expose the generated URI
    isGeneratingUri: boolean; // Loading state for URI generation
    initiateNip46Connection: () => Promise<void>; // Renamed function
    generateNewKeys: () => Promise<{ npub: string; nsec: string } | null>;
    loginWithNsec: (nsec: string) => Promise<boolean>;
    logout: () => Promise<void>;
    saveNsecToDb: (nsec: string) => Promise<void>; // Explicit save function
    getNdkSigner: () => NDKPrivateKeySigner | NDKNip46Signer | undefined; // To get the current signer for NDK
    signEvent: (event: NostrEvent) => Promise<NostrEvent | null>; // Unified signing method
}

// Placeholder for the TV App's identity. Generate one if needed on first load?
// Or require setting via config/env. Using a placeholder for now.
const APP_IDENTITY_NPUB = "npub1maulfygsmh6q7pm7405du5774g5f6y3zce3ez8wsrfdtulqf37wqf57zfh"; // TODO: Replace with your app's actual npub
const APP_IDENTITY_NSEC = "nsec1..."; // TODO: Ideally load from secure config, not hardcoded

const NIP46_RELAYS = ['wss://relay.damus.io', 'wss://relay.primal.net', 'wss://nsec.app'];

export const useAuth = (ndkInstance: NDK | undefined): UseAuthReturn => {
    const [currentUserNpub, setCurrentUserNpub] = useState<string | null>(null);
    const [currentUserNsec, setCurrentUserNsec] = useState<string | null>(null);
    const [nip46Signer, setNip46Signer] = useState<NDKNip46Signer | null>(null);
    const [isLoadingAuth, setIsLoadingAuth] = useState<boolean>(true);
    const [authError, setAuthError] = useState<string | null>(null);
    const [nip46LocalSecret, setNip46LocalSecret] = useState<string | null>(null); // Connection secret (hex)
    const [nip46ConnectUri, setNip46ConnectUri] = useState<string | null>(null); // State for the URI
    const [isGeneratingUri, setIsGeneratingUri] = useState<boolean>(false); // Loading state for URI generation

    const isLoggedIn = !!(currentUserNpub && (currentUserNsec || nip46Signer));

    // --- Nsec Handling ---

    const loadNsecFromDb = useCallback(async () => {
        try {
            // Use specific helper
            const storedData = await idb.getSetting('currentUserNsec') as StoredNsecData | undefined;
            if (storedData?.nsec) {
                const decoded = nip19.decode(storedData.nsec);
                if (decoded.type === 'nsec') {
                    const skBytes = decoded.data as Uint8Array;
                    // Pass Uint8Array to getPublicKey
                    const pkHex = getPublicKey(skBytes);
                    const npub = nip19.npubEncode(pkHex);
                    setCurrentUserNsec(storedData.nsec);
                    setCurrentUserNpub(npub);
                    console.log("Loaded nsec from DB for npub:", npub);
                    return storedData.nsec;
                } else {
                    console.error("Stored key is not a valid nsec.");
                    await idb.deleteSetting('currentUserNsec'); // Clear invalid data
                }
            }
        } catch (error) {
            console.error("Failed to load nsec from IndexedDB:", error);
            setAuthError("Failed to load saved login credentials.");
        }
        return null;
    }, []);

    const saveNsecToDb = useCallback(async (nsec: string) => {
        try {
            if (!nsec.startsWith('nsec1')) throw new Error("Invalid nsec format.");
            const decoded = nip19.decode(nsec);
            if (decoded.type !== 'nsec') throw new Error("Decoded key is not nsec.");

            // Use specific helper
            await idb.putSetting({ id: 'currentUserNsec', nsec });
            console.log("Saved nsec to DB.");

            const skBytes = decoded.data as Uint8Array;
            // Pass Uint8Array to getPublicKey
            const pkHex = getPublicKey(skBytes);
            const npub = nip19.npubEncode(pkHex);
            setCurrentUserNsec(nsec);
            setCurrentUserNpub(npub);
            setNip46Signer(null);
            setAuthError(null);
        } catch (error) {
            console.error("Failed to save nsec to IndexedDB:", error);
            setAuthError("Failed to save login credentials.");
            throw error;
        }
    }, []);

    const clearNsecFromDb = useCallback(async () => {
        try {
             // Use specific helper
            await idb.deleteSetting('currentUserNsec');
            console.log("Cleared nsec from DB.");
        } catch (error) {
            console.error("Failed to clear nsec from IndexedDB:", error);
        }
    }, []);

    const generateNewKeys = useCallback(async (): Promise<{ npub: string; nsec: string } | null> => {
        console.log("Generating new keys...");
        setAuthError(null);
        try {
            // Check if function exists
            if (typeof generatePrivateKey !== 'function') {
                 setAuthError("Key generation unavailable (generatePrivateKey not found in nostr-tools).");
                 console.error("generatePrivateKey not found in nostr-tools.");
                 return null;
            }
            const skHex = generatePrivateKey(); // hex string
            const skBytes = Buffer.from(skHex, 'hex');
            // Pass Uint8Array to getPublicKey
            const pkHex = getPublicKey(skBytes);
            const npub = nip19.npubEncode(pkHex);
            // Pass Uint8Array to nsecEncode
            const nsec = nip19.nsecEncode(skBytes);
            console.log("Generated new keys. Npub:", npub);
            return { npub, nsec };
        } catch (error) {
            console.error("Key generation failed:", error);
            setAuthError("Failed to generate new keys.");
            return null;
        }
    }, []);

    const loginWithNsec = useCallback(async (nsecInput: string): Promise<boolean> => {
         console.log("Attempting login with nsec...");
         setIsLoadingAuth(true);
         setAuthError(null);
        try {
            const decoded = nip19.decode(nsecInput);
            if (decoded.type === 'nsec') {
                 await saveNsecToDb(nsecInput);
                 setIsLoadingAuth(false);
                return true;
            } else {
                throw new Error("Invalid nsec format provided.");
            }
        } catch (error: any) {
            console.error("Login with nsec failed:", error);
            setAuthError(error.message || "Invalid nsec provided.");
            setCurrentUserNsec(null);
            setCurrentUserNpub(null);
            setNip46Signer(null);
            setIsLoadingAuth(false);
            return false;
        }
    }, [saveNsecToDb]);

    // --- NIP-46 Handling ---

    // Renamed function to be more explicit
    const initiateNip46Connection = useCallback(async (): Promise<void> => {
        if (!ndkInstance) {
            setAuthError("NDK not initialized.");
            return;
        }
        // Ensure APP_IDENTITY_NPUB is valid
        let appPublicKeyHex: string;
        try {
            if (!APP_IDENTITY_NPUB || !APP_IDENTITY_NPUB.startsWith('npub1')) {
                 throw new Error("Invalid or missing APP_IDENTITY_NPUB placeholder.");
             }
            const decodedAppKey = nip19.decode(APP_IDENTITY_NPUB);
            if (decodedAppKey.type !== 'npub') throw new Error("APP_IDENTITY_NPUB is not a valid npub.");
            appPublicKeyHex = decodedAppKey.data; // This is already hex
        } catch (e) {
             console.error("Invalid APP_IDENTITY_NPUB:", e);
             setAuthError("Application NIP-46 identity is not configured correctly.");
             return;
        }

        console.log("Initiating NIP-46 connection URI generation...");
        setIsGeneratingUri(true);
        setAuthError(null);
        setNip46ConnectUri(null); // Clear previous URI

        let localSecretHex: string;
        try {
            // Check if generatePrivateKey exists
            if (typeof generatePrivateKey !== 'function') {
                throw new Error("Key generation unavailable (generatePrivateKey not found).");
            }
            localSecretHex = generatePrivateKey();
            setNip46LocalSecret(localSecretHex);
        } catch(e: any) {
            console.error("Failed to generate local secret for NIP-46:", e);
            setAuthError(`NIP-46 init error: ${e.message}`);
            setIsGeneratingUri(false);
            return;
        }

        try {
            // Check if generateConnectUri exists
            if (typeof nip46.generateConnectUri !== 'function') {
                throw new Error("nostr-tools nip46.generateConnectUri function not found. Check package version or NDK alternatives.");
            }

            const connectUri = nip46.generateConnectUri(
                appPublicKeyHex,
                localSecretHex,
                NIP46_RELAYS,
                { name: 'Madstr TV App' }
            );

            console.log("Generated nostrconnect URI:", connectUri);
            setNip46ConnectUri(connectUri); // Set state for QR code display

            // --- Start Listening for Response (Requires Implementation) ---
            // You'll need to subscribe to events related to localSecretHex
            // const filter: NDKFilter = { kinds: [24133], authors: [remoteSignerPubkey?], "#p": [appPublicKeyHex] };
            // Decrypt content using localSecretHex...
            // Call handleNip46Response when a valid response is received
            console.warn("NIP-46 Response Listener not implemented yet.");
            // ----------------------------------------------------------------

        } catch (error: any) {
             console.error("Failed to generate NIP-46 URI or initiate listener:", error);
             setAuthError(`NIP-46 Error: ${error.message}`);
             setNip46LocalSecret(null); // Clear secret on error
        } finally {
             setIsGeneratingUri(false);
        }

    }, [ndkInstance]);

    const handleNip46Response = useCallback(async (/* decryptedPayload, remoteSignerPubkey */) => {
        // --- Placeholder: Full Implementation Needed ---
        console.log("Handling NIP-46 Response...");
        if (!ndkInstance || !nip46LocalSecret) {
             console.error("Cannot handle NIP-46 response: NDK or secret missing.");
             return;
        }
        setIsLoadingAuth(true);
        setAuthError(null);
        setNip46ConnectUri(null); // Clear URI once connection established/failed

        try {
            // 1. Verify the response (e.g., using the connection token)
            // 2. Extract the remote signer's pubkey (hex) from the payload/event
            const remoteSignerPubkeyHex = "REMOTE_SIGNER_PUBKEY_HEX"; // Replace with actual value
            const remoteSignerNpub = nip19.npubEncode(remoteSignerPubkeyHex);

            console.log(`NIP-46 handshake successful with ${remoteSignerNpub}`);

            // 3. Create the NDKNip46Signer instance
            // Use the local NIP-46 secret (hex) for the internal signer
            const signer = new NDKNip46Signer(ndkInstance, remoteSignerPubkeyHex, new NDKPrivateKeySigner(nip46LocalSecret));
            // TODO: Set relay hint if provided by bunker

            setNip46Signer(signer);
            setCurrentUserNpub(remoteSignerNpub);
            setCurrentUserNsec(null); // Clear nsec
            await clearNsecFromDb();

            console.log("NIP-46 Signer configured for npub:", remoteSignerNpub);
            setAuthError(null);

         } catch (error) {
             console.error("Failed to handle NIP-46 response:", error);
             setAuthError("NIP-46 connection failed or response invalid.");
             setNip46Signer(null);
             setCurrentUserNpub(null);
         } finally {
            setIsLoadingAuth(false);
            setNip46LocalSecret(null); // Clear secret after attempt
         }
    }, [ndkInstance, nip46LocalSecret, clearNsecFromDb]);

    // --- General Auth Logic ---

    const logout = useCallback(async () => {
         console.log("Logging out...");
         setIsLoadingAuth(true);
         setAuthError(null);
         setCurrentUserNpub(null);
         setCurrentUserNsec(null);
         setNip46Signer(null);
         setNip46LocalSecret(null);
         setNip46ConnectUri(null);
         await clearNsecFromDb();
         setIsLoadingAuth(false);
         console.log("Logout complete.");
    }, [clearNsecFromDb]);

    // Initialize auth state on mount
    useEffect(() => {
        const initializeAuth = async () => {
            setIsLoadingAuth(true);
            setAuthError(null);
            const loadedNsec = await loadNsecFromDb();
            if (!loadedNsec) {
                console.log("No saved nsec found. User is logged out.");
            }
            setIsLoadingAuth(false);
        };
        if (ndkInstance) {
            initializeAuth();
        } else {
            // Handle case where NDK is not ready yet? Maybe wait?
            setIsLoadingAuth(false); // Or keep true until NDK is ready?
            console.warn("useAuth initialized before NDK instance was ready.");
        }
    }, [loadNsecFromDb, ndkInstance]);

    // --- Signer Access & Unified Signing ---

    const getNdkSigner = useCallback((): NDKPrivateKeySigner | NDKNip46Signer | undefined => {
        if (nip46Signer) {
            return nip46Signer;
        }
        if (currentUserNsec) {
            try {
                const decoded = nip19.decode(currentUserNsec);
                if (decoded.type === 'nsec') {
                     const skBytes = decoded.data as Uint8Array;
                     // NDKPrivateKeySigner expects hex string
                     const skHex = Buffer.from(skBytes).toString('hex');
                     return new NDKPrivateKeySigner(skHex);
                } else {
                     throw new Error("Decoded key is not nsec type");
                }
            } catch (e) {
                console.error("Failed to create signer from stored nsec:", e);
                setAuthError("Stored nsec is invalid. Please login again.");
                logout(); // Log out if nsec is bad
                return undefined;
            }
        }
        return undefined;
    }, [currentUserNsec, nip46Signer, logout]);


    const signEvent = useCallback(async (eventInput: NostrEvent): Promise<NostrEvent | null> => {
        const signer = getNdkSigner();
        if (!signer) {
            setAuthError("Not logged in or signer unavailable.");
            console.error("Sign event failed: No signer available.");
            return null;
        }
        if (!ndkInstance) {
            setAuthError("NDK not initialized.");
            console.error("Sign event failed: NDK not available.");
            return null;
        }

        try {
            const event = new NDKEvent(ndkInstance, eventInput);
            await event.sign(signer);
            console.log("Event signed successfully:", event.id);
            return event.rawEvent();
        } catch (error: any) {
            console.error("Failed to sign event:", error);
            // Attempt to provide more specific error from NIP-46 if possible
            const nip46ErrorMessage = (error.message || '').includes('NIP-46') ? `Signer Error: ${error.message}` : 'Failed to sign event locally';
            setAuthError(nip46ErrorMessage);
            return null;
        }
    }, [getNdkSigner, ndkInstance]);


    return {
        currentUserNpub,
        currentUserNsec,
        isLoggedIn,
        isLoadingAuth,
        authError,
        nip46ConnectUri, // Expose URI state
        isGeneratingUri,
        initiateNip46Connection, // Expose renamed function
        generateNewKeys,
        loginWithNsec,
        logout,
        saveNsecToDb,
        getNdkSigner,
        signEvent,
    };
}; 