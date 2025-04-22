import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import * as nip19 from 'nostr-tools/nip19';
import * as nip04 from 'nostr-tools/nip04';
// import * as nip46 from 'nostr-tools/nip46'; // Removed unused import
// import { Buffer } from 'buffer';
// Import key generation from the correct submodule
import { getPublicKey, generateSecretKey } from 'nostr-tools/pure';
// Removed incorrect import: import { generatePrivateKey } from 'nostr-tools';
// Removed unused NDKFilter, NDKSubscriptionOptions from import
import NDK, { NDKPrivateKeySigner, NDKNip46Signer, NDKEvent, NostrEvent, NDKFilter, NDKSubscription, NDKUser } from '@nostr-dev-kit/ndk';
// Corrected import path - removed .ts extension
import { idb, StoredNsecData } from '../utils/idb';
// Import the new helper
// import { bytesToHex } from '../utils/misc';

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
    // NIP-04 Methods
    encryptDm: (recipientPubkeyHex: string, plaintext: string) => Promise<string>;
    decryptDm: (senderPubkeyHex: string, ciphertext: string) => Promise<string>;
}

// Placeholder for the TV App's identity. Generate one if needed on first load?
// Or require setting via config/env. Using a placeholder for now.
// const APP_IDENTITY_NPUB = "npub1..."; // Use NDK's signer pubkey if available, or generate one
// const APP_IDENTITY_NSEC = "nsec1..."; // TODO: Ideally load from secure config, not hardcoded (Commented out as unused)

const NIP46_RELAYS = ['wss://nsec.app', 'wss://relay.damus.io', 'wss://relay.primal.net'];
const NIP46_CONNECT_TIMEOUT = 75000; // 75 seconds

// Accept NDK | undefined (aligning with useMediaAuthors)
export const useAuth = (ndkInstance: NDK | undefined): UseAuthReturn => {
    const [currentUserNpub, setCurrentUserNpub] = useState<string | null>(null);
    const [currentUserNsec, setCurrentUserNsec] = useState<string | null>(null);
    // Store the pubkey of the remote NIP-46 signer, not the signer instance itself directly initially
    const [nip46SignerPubkey, setNip46SignerPubkey] = useState<string | null>(null);
    // Removed nip46Signer state, will be created on demand in getNdkSigner
    const [isLoadingAuth, setIsLoadingAuth] = useState<boolean>(true);
    const [authError, setAuthError] = useState<string | null>(null);
    // Use refs for temporary connection state to avoid re-renders triggering effects unnecessarily
    const nip46TempPrivKeyRef = useRef<Uint8Array | null>(null);
    const nip46SubscriptionRef = useRef<NDKSubscription | null>(null);
    const nip46TimeoutRef = useRef<NodeJS.Timeout | null>(null);
    // Removed nip46LocalSecret state, use ref instead
    const [nip46ConnectUri, setNip46ConnectUri] = useState<string | null>(null); // State for the URI
    const [isGeneratingUri, setIsGeneratingUri] = useState<boolean>(false); // Loading state for URI generation
    const [followedTags, setFollowedTagsState] = useState<string[]>(DEFAULT_FOLLOWED_TAGS); // Initialize with defaults

    // Derived state for isLoggedIn based on nsec or nip46 signer pubkey
    const isLoggedIn = !!(currentUserNpub && (currentUserNsec || nip46SignerPubkey));

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
            setNip46SignerPubkey(null);
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
            setNip46SignerPubkey(null);
             setFollowedTagsState(DEFAULT_FOLLOWED_TAGS); // Reset tags to default on failed login
            setIsLoadingAuth(false);
            return false;
        }
    }, [saveNsecToDb]);

    // --- NIP-46 Handling ---

    // Function to cleanup NIP-46 connection attempt artifacts
    const cleanupNip46Attempt = useCallback(() => {
        console.log("Cleaning up NIP-46 attempt...");
        if (nip46SubscriptionRef.current) {
            nip46SubscriptionRef.current.stop();
            nip46SubscriptionRef.current = null;
            console.log("Stopped NIP-46 subscription.");
        }
        if (nip46TimeoutRef.current) {
            clearTimeout(nip46TimeoutRef.current);
            nip46TimeoutRef.current = null;
            console.log("Cleared NIP-46 timeout.");
        }
        nip46TempPrivKeyRef.current = null; // Clear temporary key
        setNip46ConnectUri(null);
        setIsGeneratingUri(false);
        setIsLoadingAuth(false); // Ensure loading state is reset
        console.log("NIP-46 cleanup complete.");
    }, []); // No dependencies needed for cleanup logic itself


    // Handler for responses from the NIP-46 signer during connection
    const handleNip46Response = useCallback(async (event: NDKEvent) => {
        console.log("Received NIP-46 response event:", event.id);

        if (!nip46TempPrivKeyRef.current) {
            console.error("Cannot handle NIP-46 response: temporary private key missing.");
            return;
        }

        try {
            const decryptedContent = await nip04.decrypt(nip46TempPrivKeyRef.current, event.pubkey, event.content);
            console.log("Decrypted NIP-46 response content:", decryptedContent);
            const response = JSON.parse(decryptedContent);

            // Basic validation: Check if it's the connect confirmation
            // NIP-46 spec: Response to 'connect' is 'ack' or 'error'
            // NIP-46 spec: Response to 'get_public_key' is the pubkey or 'error'
            // We should ideally track the request ID, but for simplicity, let's check 'result'
            if (response.result === "ack") {
                // This acknowledges the 'connect' request. Now request the public key.
                console.log("NIP-46 connect acknowledged by signer:", event.pubkey);
                // Store signer pubkey immediately
                setNip46SignerPubkey(event.pubkey);

                // Prepare get_public_key request
                 const requestId = crypto.randomUUID(); // Generate a unique ID for the request
                 const requestPayload = JSON.stringify({
                     id: requestId,
                     method: "get_public_key",
                     params: [],
                 });
                 const encryptedRequest = await nip04.encrypt(nip46TempPrivKeyRef.current, event.pubkey, requestPayload);

                 const requestEvent = new NDKEvent(ndkInstance);
                 requestEvent.kind = 24133; // NIP-46 request
                 requestEvent.created_at = Math.floor(Date.now() / 1000);
                 requestEvent.content = encryptedRequest;
                 requestEvent.tags = [['p', event.pubkey]]; // Target the signer

                 // Sign with temporary key
                 const tempPrivKey = nip46TempPrivKeyRef.current;
                 if (!tempPrivKey) {
                      console.error("Temporary private key missing, cannot sign get_public_key request");
                      throw new Error("NIP46 Internal Error: Missing temp key for signing");
                 }
                 const tempSigner = new NDKPrivateKeySigner(tempPrivKey);
                 await requestEvent.sign(tempSigner);
                 console.log("Publishing get_public_key request to signer...");
                 await requestEvent.publish();
                 // Keep listening for the get_public_key response...


            } else if (response.method === "get_public_key" && response.result) {
                 // Received the public key response
                 const userPubkeyHex = response.result;
                 const userNpub = nip19.npubEncode(userPubkeyHex);
                 console.log("Received user public key via NIP-46:", userNpub);

                 setCurrentUserNpub(userNpub);
                 setCurrentUserNsec(null); // Ensure nsec is cleared
                 setIsLoadingAuth(false); // Auth process complete
                 setAuthError(null);

                 // Login successful - load user tags and merge
                 const userTags = await loadFollowedTags();
                 const mergedTags = Array.from(new Set([...DEFAULT_FOLLOWED_TAGS, ...userTags]));
                 setFollowedTagsState(mergedTags);
                 console.log("Merged tags on NIP-46 login:", mergedTags);

                 // Final cleanup
                 cleanupNip46Attempt();


            } else if (response.error) {
                console.error("NIP-46 Error Response:", response.error);
                setAuthError(`Wallet Connection Error: ${response.error.message || 'Unknown error'}`);
                cleanupNip46Attempt();
            } else {
                console.warn("Received unexpected NIP-46 response structure:", response);
            }

        } catch (error) {
            console.error("Failed to decrypt or handle NIP-46 response:", error);
            setAuthError(`Wallet Connection Failed: ${error instanceof Error ? error.message : 'Decryption/Parsing Error'}`);
            cleanupNip46Attempt();
        }

    }, [ndkInstance, cleanupNip46Attempt, loadFollowedTags]); // Added dependencies


    // Renamed function to be more explicit
    const initiateNip46Connection = useCallback(async (): Promise<void> => {
        if (!ndkInstance) {
            setAuthError("NDK not initialized.");
            console.error("Cannot initiate NIP-46: NDK instance is missing.");
            return;
        }

        // Clean up any previous attempt first
        cleanupNip46Attempt();

        console.log("Initiating NIP-46 connection...");
        setIsGeneratingUri(true); // Indicate URI generation starts
        setIsLoadingAuth(true); // Indicate auth process starts
        setAuthError(null);

        let tempPrivKeyBytes: Uint8Array;
        let tempPubKeyHex: string;

        try {
            // 1. Generate temporary keys for this connection attempt
            if (typeof generateSecretKey !== 'function') {
                throw new Error("Key generation unavailable (generateSecretKey not found).");
            }
            tempPrivKeyBytes = generateSecretKey();
            tempPubKeyHex = getPublicKey(tempPrivKeyBytes); // Use nostr-tools pure function
            nip46TempPrivKeyRef.current = tempPrivKeyBytes; // Store private key in ref

            // 2. Construct the nostrconnect URI
            const uriParams = new URLSearchParams();
            // Add relays
            NIP46_RELAYS.forEach(relay => uriParams.append('relay', relay));
            // Add metadata
            uriParams.append('metadata', JSON.stringify({
                name: "Madstr.tv",
                // url: "optional url to your app",
                // description: "optional description",
                // icons: ["optional icon url"]
            }));

            const connectUri = `nostrconnect://${tempPubKeyHex}?${uriParams.toString()}`;
            setNip46ConnectUri(connectUri);
            console.log("Generated NIP-46 Connect URI:", connectUri);
            setIsGeneratingUri(false); // URI generation complete

            // 3. Start listening for the response on specified relays
            const filter: NDKFilter = {
                kinds: [24133], // NIP-46 responses
                '#p': [tempPubKeyHex], // Tagged to our temporary public key
                since: Math.floor(Date.now() / 1000) - 10, // Look back slightly just in case
            };
            console.log("Starting NIP-46 subscription with filter:", filter, "Relays:", NIP46_RELAYS);

            const subscription = ndkInstance.subscribe(
                filter,
                { closeOnEose: false } // Keep listening until explicitly stopped, rely on ndkInstance relays
            );

            subscription.on('event', handleNip46Response);
            subscription.on('eose', () => console.log('NIP-46 subscription EOSE received. Still listening...'));
            subscription.on('closed', () => console.log('NIP-46 subscription closed.'));

            nip46SubscriptionRef.current = subscription; // Store subscription to allow stopping it

            // 4. Set timeout for the connection attempt
            nip46TimeoutRef.current = setTimeout(() => {
                console.warn(`NIP-46 connection timed out after ${NIP46_CONNECT_TIMEOUT / 1000}s.`);
                setAuthError("Wallet connection timed out. Please try again.");
                cleanupNip46Attempt();
            }, NIP46_CONNECT_TIMEOUT);

        } catch (error) {
            console.error("Failed to initiate NIP-46 connection or generate URI:", error);
            setAuthError(`Failed to prepare wallet connection: ${error instanceof Error ? error.message : String(error)}`);
            cleanupNip46Attempt(); // Ensure cleanup on error
        }
        // Note: We leave isLoadingAuth=true until handleNip46Response completes or timeout occurs
    }, [ndkInstance, handleNip46Response, cleanupNip46Attempt]);

     // Function to cancel the NIP-46 connection attempt
     const cancelNip46Connection = useCallback(() => {
         console.log("User cancelled NIP-46 connection attempt.");
         setAuthError("Connection cancelled."); // Set a specific message
         cleanupNip46Attempt(); // Use the cleanup helper
     }, [cleanupNip46Attempt]);

    // --- General Auth Logic ---

    const logout = useCallback(async () => {
        console.log("Logging out...");
        setIsLoadingAuth(true);
        setAuthError(null);
        setCurrentUserNpub(null);
        setCurrentUserNsec(null);
        setNip46SignerPubkey(null);
        setNip46ConnectUri(null);
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
                // Check if NIP-46 signer pubkey is stored (add persistence if needed)
                // For now, assume no NIP-46 persistence, just use loaded/default tags
                 setFollowedTagsState(loadedTags); // Use whatever loadFollowedTags returned (defaults or stored)
                console.log("Auth initialized, no stored nsec. Using tags:", loadedTags);
            }
             // TODO: Add logic to check for existing NIP-46 connection state if possible?
             // This might involve storing the remoteSignerPubkey securely.

            setIsLoadingAuth(false);
        };

        initializeAuth();
        // Dependencies: loadNsecFromDb, loadFollowedTags
        // Need to ensure these functions are stable (wrapped in useCallback)
    }, [loadNsecFromDb, loadFollowedTags]);

    // --- Signer Logic ---

    const getNdkSigner = useCallback((): NDKPrivateKeySigner | NDKNip46Signer | undefined => {
        if (nip46SignerPubkey && currentUserNpub && ndkInstance) {
             // If we have a NIP-46 signer pubkey and the user's npub, create the NIP-46 signer instance
             // The NDKNip46Signer needs the NDK instance, the *signer's* pubkey, and the *user's* pubkey (npub)
             console.log(`Creating NDKNip46Signer for user ${currentUserNpub} with signer ${nip46SignerPubkey}`);
             // Ensure currentUserNpub is a valid hex pubkey for the signer constructor if needed,
             // NDKNip46Signer might internally handle npub conversion or require hex.
             // Let's assume NDKNip46Signer can take the user's npub directly for identification.
             // We don't need the temporary secret here anymore.
             let userHexPubkey: string;
             try {
                // Decode the user's npub to hex public key
                const decodedUserKey = nip19.decode(currentUserNpub);
                if (decodedUserKey.type !== 'npub') {
                     throw new Error("Invalid npub format for current user.");
                }
                userHexPubkey = decodedUserKey.data; // This is the hex pubkey

                // Retrieve the temporary local private key used for this session
                const tempPrivKey = nip46TempPrivKeyRef.current;
                if (!tempPrivKey) {
                    console.error("NIP-46 Session Error: Temporary local key not found. Cannot create signer.");
                    // Perhaps try re-initiating connection or prompt user?
                    return undefined;
                }

                // Create the local signer instance from the temporary key
                const localSigner = new NDKPrivateKeySigner(tempPrivKey);


                // Pass the HEX public key of the user being controlled
                // Pass the bunker's pubkey (second arg) and the local signer (third arg)
                // Note: Passing bunker pubkey as second arg might still be incorrect based on strict types (expecting nip05),
                // but let's fix the immediate type error first. The implementation might handle it.
                const signer = new NDKNip46Signer(ndkInstance, nip46SignerPubkey, localSigner);
                // TODO: Test if awaiting signer.blockUntilReady() is needed here or if it's handled internally by NDK.
                // await signer.blockUntilReady(); // Might be necessary
                return signer as NDKNip46Signer; // Explicit cast to satisfy linter, though type should match
             } catch (error) {
                  console.error("Failed to create NDKNip46Signer:", error);
                  // Fallback or error state? For now, return undefined.
                  return undefined;
             }

        } else if (currentUserNsec) {
            // If logged in with nsec, create a private key signer
            try {
                const decoded = nip19.decode(currentUserNsec);
                if (decoded.type === 'nsec') {
                    return new NDKPrivateKeySigner(decoded.data as Uint8Array);
                }
            } catch (error) {
                console.error("Failed to create NDKPrivateKeySigner from nsec:", error);
            }
        }
        // If neither NIP-46 nor nsec is available, return undefined
        return undefined;
    }, [currentUserNsec, nip46SignerPubkey, currentUserNpub, ndkInstance]); // Added dependencies

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

    // --- NIP-04 Encryption/Decryption Helpers ---

    const encryptDm = useCallback(async (recipientPubkeyHex: string, plaintext: string): Promise<string> => {
        const signer = getNdkSigner();
        if (!signer) throw new Error("Cannot encrypt DM: No user signer available.");
        if (!ndkInstance) throw new Error("NDK instance not available for creating NDKUser.");

        if (signer instanceof NDKPrivateKeySigner) {
            const sk = signer.privateKey;
            if (!sk) throw new Error("Nsec signer has no private key.");
            return nip04.encrypt(sk, recipientPubkeyHex, plaintext);
        } else if (signer instanceof NDKNip46Signer) {
            // Create NDKUser object for the recipient
            const recipientUser = new NDKUser({ pubkey: recipientPubkeyHex });
            recipientUser.ndk = ndkInstance; // Assign NDK instance if needed by encrypt
            return signer.encrypt(recipientUser, plaintext);
        } else {
            throw new Error("Unsupported signer type for DM encryption.");
        }
    }, [getNdkSigner, ndkInstance]);

    const decryptDm = useCallback(async (senderPubkeyHex: string, ciphertext: string): Promise<string> => {
        const signer = getNdkSigner();
        if (!signer) throw new Error("Cannot decrypt DM: No user signer available.");
        if (!ndkInstance) throw new Error("NDK instance not available for creating NDKUser.");

        if (signer instanceof NDKPrivateKeySigner) {
            const sk = signer.privateKey;
            if (!sk) throw new Error("Nsec signer has no private key.");
            return nip04.decrypt(sk, senderPubkeyHex, ciphertext);
        } else if (signer instanceof NDKNip46Signer) {
            // Create NDKUser object for the sender
            const senderUser = new NDKUser({ pubkey: senderPubkeyHex });
            senderUser.ndk = ndkInstance; // Assign NDK instance if needed by decrypt
            return signer.decrypt(senderUser, ciphertext);
        } else {
            throw new Error("Unsupported signer type for DM decryption.");
        }
    }, [getNdkSigner, ndkInstance]);

    // <<< Memoize the returned followedTags array >>>
    const memoizedFollowedTags = useMemo(() => followedTags, [followedTags]);

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
        cancelNip46Connection,
        generateNewKeys,
        loginWithNsec,
        logout,
        saveNsecToDb,
        getNdkSigner,
        signEvent,
        // Hashtag state and setter
        followedTags: memoizedFollowedTags,
        setFollowedTags,
        encryptDm,
        decryptDm,
    };
}; 