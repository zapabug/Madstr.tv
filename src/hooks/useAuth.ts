import { useState, useEffect, useCallback } from 'react';
import * as nip19 from 'nostr-tools/nip19';
// import * as nip46 from 'nostr-tools/nip46'; // Removed unused import
// import { Buffer } from 'buffer';
// Import key generation from the correct submodule
import { getPublicKey, generateSecretKey } from 'nostr-tools/pure';
// Removed incorrect import: import { generatePrivateKey } from 'nostr-tools';
// Removed unused NDKFilter, NDKSubscriptionOptions from import
import NDK, { NDKPrivateKeySigner, NDKNip46Signer, NDKEvent, NostrEvent } from '@nostr-dev-kit/ndk';
// Corrected import path - removed .ts extension
import { idb, StoredNsecData } from '../utils/idb';
// Import the new helper
import { bytesToHex } from '../utils/misc';

// Define default tags (can be customized)
const DEFAULT_FOLLOWED_TAGS = ['memes', 'landscape', 'photography', 'art', 'music', 'podcast'];

// Define the shape of the hook's return value
// Export the interface so it can be used externally
export interface UseAuthReturn {
    currentUserNpub: string | null;
    currentUserNsec: string | null; // Exposed cautiously, primarily for internal use or backup
    isLoggedIn: boolean;
    isLoadingAuth: boolean;
    authError: string | null;
    nip46ConnectUri: string | null; // Expose the generated URI
    isGeneratingUri: boolean; // Loading state for URI generation
    initiateNip46Connection: () => Promise<void>; // Renamed function
    cancelNip46Connection: () => void; // Function to cancel NIP-46 attempt
    generateNewKeys: () => Promise<{ npub: string; nsec: string } | null>;
    loginWithNsec: (nsec: string) => Promise<boolean>;
    logout: () => Promise<void>;
    saveNsecToDb: (nsec: string) => Promise<void>; // Explicit save function
    getNdkSigner: () => NDKPrivateKeySigner | NDKNip46Signer | undefined; // To get the current signer for NDK
    signEvent: (event: NostrEvent) => Promise<NostrEvent | null>; // Unified signing method
    // Hashtag state and setter
    followedTags: string[];
    setFollowedTags: (tags: string[]) => void;
}

// Placeholder for the TV App's identity. Generate one if needed on first load?
// Or require setting via config/env. Using a placeholder for now.
const APP_IDENTITY_NPUB = "npub1maulfygsmh6q7pm7405du5774g5f6y3zce3ez8wsrfdtulqf37wqf57zfh"; // TODO: Replace with your app's actual npub
// const APP_IDENTITY_NSEC = "nsec1..."; // TODO: Ideally load from secure config, not hardcoded (Commented out as unused)

const NIP46_RELAYS = ['wss://relay.damus.io', 'wss://relay.primal.net', 'wss://nsec.app'];

// Accept NDK | undefined (aligning with useMediaAuthors)
export const useAuth = (ndkInstance: NDK | undefined): UseAuthReturn => {
    const [currentUserNpub, setCurrentUserNpub] = useState<string | null>(null);
    const [currentUserNsec, setCurrentUserNsec] = useState<string | null>(null);
    const [nip46Signer, setNip46Signer] = useState<NDKNip46Signer | null>(null);
    const [isLoadingAuth, setIsLoadingAuth] = useState<boolean>(true);
    const [authError, setAuthError] = useState<string | null>(null);
    const [nip46LocalSecret, setNip46LocalSecret] = useState<string | null>(null); // Connection secret (hex)
    const [nip46ConnectUri, setNip46ConnectUri] = useState<string | null>(null); // State for the URI
    const [isGeneratingUri, setIsGeneratingUri] = useState<boolean>(false); // Loading state for URI generation
    const [followedTags, setFollowedTagsState] = useState<string[]>(DEFAULT_FOLLOWED_TAGS); // Initialize with defaults

    const isLoggedIn = !!(currentUserNpub && (currentUserNsec || nip46Signer));

    // --- Hashtag Persistence ---
    const loadFollowedTags = useCallback(async () => {
        try {
            const storedTags = await idb.getSetting('followedTags') as string[] | undefined;
            if (storedTags && Array.isArray(storedTags)) {
                 // If logged in, directly use stored tags
                 // If not logged in, we'll merge defaults later if needed (or just use defaults)
                 console.log("Loaded followed tags from DB:", storedTags);
                return storedTags;
            } else {
                 console.log("No stored tags found or invalid format, using defaults initially.");
            }
        } catch (error) {
            console.error("Failed to load followed tags from IndexedDB:", error);
        }
        return DEFAULT_FOLLOWED_TAGS; // Return defaults if load fails or empty
    }, []);

     const saveFollowedTags = useCallback(async (tags: string[]) => {
        try {
            // Simple validation
            if (!Array.isArray(tags)) throw new Error("Invalid tags format: not an array.");
            const validTags = tags.filter(tag => typeof tag === 'string' && tag.trim().length > 0 && tag.length < 50);
            if (validTags.length !== tags.length) {
                console.warn("Some invalid tags were filtered before saving.");
            }
            await idb.putSetting({ id: 'followedTags', tags: validTags });
            console.log("Saved followed tags to DB:", validTags);
        } catch (error) {
            console.error("Failed to save followed tags to IndexedDB:", error);
            // Optionally set an error state? For now, just log.
        }
     }, []);

     // Wrap the state setter to also save to DB
     const setFollowedTags = useCallback((tags: string[]) => {
         setFollowedTagsState(tags);
         saveFollowedTags(tags);
     }, [saveFollowedTags]);


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

             // On successful nsec login/save, load user's tags, merging with defaults
             const userTags = await loadFollowedTags();
             // Merge: Create a Set from both arrays to get unique values, then convert back to array
             const mergedTags = Array.from(new Set([...DEFAULT_FOLLOWED_TAGS, ...userTags]));
             setFollowedTagsState(mergedTags); // Set state directly, save happens automatically if needed via setFollowedTags
             console.log("Merged tags on nsec login:", mergedTags);

        } catch (error) {
            console.error("Failed to save nsec to IndexedDB:", error);
            setAuthError("Failed to save login credentials.");
            throw error;
        }
    }, [loadFollowedTags]); // Removed setFollowedTags from deps, use setFollowedTagsState

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
            // Check if function exists (now generateSecretKey)
            if (typeof generateSecretKey !== 'function') {
                 setAuthError("Key generation unavailable (generateSecretKey not found in nostr-tools/pure).");
                 console.error("generateSecretKey not found in nostr-tools/pure.");
                 return null;
            }
            const skBytes = generateSecretKey(); // Returns Uint8Array
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
                 await saveNsecToDb(nsecInput); // This now handles setting tags
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
             setFollowedTagsState(DEFAULT_FOLLOWED_TAGS); // Reset tags to default on failed login
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

        console.log("Initiating NIP-46 connection...");
        setIsGeneratingUri(true);
        setAuthError(null);
        setNip46ConnectUri(null); // Clear previous URI

        let localSecretBytes: Uint8Array;
        let localSecretHex: string;
        try {
            // Generate the local secret for this connection attempt
            if (typeof generateSecretKey !== 'function') {
                throw new Error("Key generation unavailable (generateSecretKey not found).");
            }
            localSecretBytes = generateSecretKey();
            // Replace Buffer usage with the helper function
            localSecretHex = bytesToHex(localSecretBytes);
            setNip46LocalSecret(localSecretHex); // Store hex for potential use in NDKNip46Signer

            // --- NDK Signer Logic for URI Generation (Simplified) ---
            // We *need* a temporary signer to create the URI, even if it's just using the local secret.
            // NDKNip46Signer itself is for *after* connection.
            const tempSigner = new NDKPrivateKeySigner(localSecretBytes);

            // Construct the connection URI MANUALLY as NDK doesn't have a direct helper for this specific flow
            const uriParams = new URLSearchParams({
                pubkey: appPublicKeyHex, // App's pubkey
                // Spread relay URLs into multiple 'relay' parameters
                ...NIP46_RELAYS.reduce((acc, relay) => ({ ...acc, relay }), {}),
                 metadata: JSON.stringify({ name: "Madstr.tv" })
            });
            // Use pubkey (hex string) property of the signer for the URI
            const connectUri = `nostrconnect://${tempSigner.pubkey}?${uriParams.toString()}`;
            // Note: The URI uses the *local* secret's public key as the identifier for this connection attempt.
            // The remote signer connects back to this ephemeral key.

             setNip46ConnectUri(connectUri);
            console.log("Generated NIP-46 Connect URI:", connectUri);

            // --- TODO: Start Listening for Response --- 
             // Need to subscribe using ndkInstance to events related to the appPublicKeyHex
             // where the event's `p` tag matches the localSecret's publicKey (bytesToHex(tempSigner.publicKey))
             // and decrypt the content using the localSecretBytes.
             console.warn("NIP-46 Response Listener not implemented yet!");
             // handleNip46Response(...) should be called when a response is received

        } catch (error) {
            console.error("Failed to initiate NIP-46 connection or generate URI:", error);
            setAuthError(`Failed to prepare wallet connection: ${error instanceof Error ? error.message : String(error)}`);
            setNip46LocalSecret(null); // Clear secret on error
        } finally {
            setIsGeneratingUri(false);
        }
    }, [ndkInstance]);

     // Function to cancel the NIP-46 connection attempt
     const cancelNip46Connection = useCallback(() => {
         console.log("Cancelling NIP-46 connection attempt.");
         setNip46ConnectUri(null);
         setNip46LocalSecret(null);
         setIsGeneratingUri(false);
         setAuthError(null);
         // TODO: Also unsubscribe from any NIP-46 response listener if active
     }, []);

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

        // Example structure (needs actual implementation):
        // 1. Validate the response (signature, request ID match, etc.)
        // 2. Extract the remote signer's pubkey and granted permissions.
        // 3. Create the NDKNip46Signer instance:
        //    const signer = new NDKNip46Signer(ndkInstance, remoteSignerPubkey, new NDKPrivateKeySigner(nip19.decode(nip46LocalSecret).data as Uint8Array));
        // 4. Store the signer and remote pubkey
        //    setNip46Signer(signer);
        //    setCurrentUserNpub(nip19.npubEncode(remoteSignerPubkey));
        //    setCurrentUserNsec(null); // Clear nsec if logging in via NIP-46
        // 5. Load user's tags and merge with defaults
             // const userTags = await loadFollowedTags();
             // const mergedTags = Array.from(new Set([...DEFAULT_FOLLOWED_TAGS, ...userTags]));
             // setFollowedTagsState(mergedTags);
             // console.log("Merged tags on NIP-46 login:", mergedTags);

        // --- End Placeholder ---

         console.error("handleNip46Response not fully implemented!");
         setAuthError("NIP-46 login response handling is not complete."); // Temporary error
         setIsLoadingAuth(false);
    }, [ndkInstance, nip46LocalSecret, loadFollowedTags]);


    // --- General Auth Logic ---

    const logout = useCallback(async () => {
        console.log("Logging out...");
        setIsLoadingAuth(true);
        setAuthError(null);
        setCurrentUserNpub(null);
        setCurrentUserNsec(null);
        setNip46Signer(null);
        setNip46ConnectUri(null);
        setNip46LocalSecret(null);
        await clearNsecFromDb();
        // Reset tags to default on logout
        setFollowedTagsState(DEFAULT_FOLLOWED_TAGS);
        // Optionally clear saved tags from DB on logout? Or keep them for next login?
        // await idb.deleteSetting('followedTags'); // Uncomment to clear tags on logout
        setIsLoadingAuth(false);
        console.log("Logout complete.");
    }, [clearNsecFromDb]);

    // --- Initialization Effect ---
    useEffect(() => {
        const initializeAuth = async () => {
            console.log("Initializing auth...");
            setIsLoadingAuth(true);
            setAuthError(null);
            const loadedNsec = await loadNsecFromDb();
            const loadedTags = await loadFollowedTags();

            if (loadedNsec) {
                 // Nsec loaded, merge tags
                 const mergedTags = Array.from(new Set([...DEFAULT_FOLLOWED_TAGS, ...loadedTags]));
                 setFollowedTagsState(mergedTags);
                console.log("Auth initialized with stored nsec and merged tags.");
            } else {
                 // No nsec, use default/stored tags directly
                 setFollowedTagsState(loadedTags); // Use whatever loadFollowedTags returned (defaults or stored)
                console.log("Auth initialized, no stored nsec. Using tags:", loadedTags);
            }
             // TODO: Add logic to check for existing NIP-46 connection state if possible?
             // This might involve storing the remoteSignerPubkey and localSecret securely.

            setIsLoadingAuth(false);
        };

        initializeAuth();
        // Dependencies: loadNsecFromDb, loadFollowedTags
        // Need to ensure these functions are stable (wrapped in useCallback)
    }, [loadNsecFromDb, loadFollowedTags]);

    // --- Signer Logic ---

    const getNdkSigner = useCallback((): NDKPrivateKeySigner | NDKNip46Signer | undefined => {
        if (nip46Signer) {
            return nip46Signer;
        }
        if (currentUserNsec) {
            try {
                const decoded = nip19.decode(currentUserNsec);
                if (decoded.type === 'nsec') {
                    return new NDKPrivateKeySigner(decoded.data as Uint8Array);
                } else {
                     console.error("Current user key is not a valid nsec for creating signer.");
                }
            } catch (error) {
                 console.error("Failed to create NDKPrivateKeySigner from nsec:", error);
            }
        }
        return undefined;
    }, [currentUserNsec, nip46Signer]);

     const signEvent = useCallback(async (event: NostrEvent): Promise<NostrEvent | null> => {
        const signer = getNdkSigner();
        if (!signer) {
            setAuthError("Cannot sign event: No active signer (not logged in?).");
            console.error("signEvent called without an active signer.");
            return null;
        }

        try {
            // Ensure the event object is compatible with NDKEvent structure if needed
            // NDK signers typically expect properties like pubkey, created_at, kind, tags, content
             const ndkEvent = new NDKEvent(ndkInstance ?? undefined); // Pass undefined if ndkInstance is null
             ndkEvent.kind = event.kind as number; // Assert kind as number, handle potential undefined if necessary
             ndkEvent.content = event.content;
             ndkEvent.tags = event.tags || [];
             // Signer will add pubkey, id, sig, and potentially created_at

             await ndkEvent.sign(signer);
             console.log("Signed event:", ndkEvent.rawEvent());
             return ndkEvent.rawEvent();
        } catch (error) {
            console.error("Failed to sign event:", error);
             setAuthError(`Failed to sign event: ${error instanceof Error ? error.message : String(error)}`);
            return null;
        }
     }, [getNdkSigner, ndkInstance]);


    // Return the hook's state and functions
    return {
        currentUserNpub,
        currentUserNsec,
        isLoggedIn,
        isLoadingAuth,
        authError,
        nip46ConnectUri,
        isGeneratingUri,
        initiateNip46Connection,
        cancelNip46Connection, // Added cancel function
        generateNewKeys,
        loginWithNsec,
        logout,
        saveNsecToDb, // Expose explicit save if needed elsewhere
        getNdkSigner,
        signEvent,
        // Hashtag state
        followedTags,
        setFollowedTags,
    };
}; 