import { useState, useEffect, useCallback, useRef } from 'react';
import * as nip19 from 'nostr-tools/nip19';
// NIP-04 is now handled by NDK signer
// import * as nip04 from 'nostr-tools/nip04';
// import * as nip46 from 'nostr-tools/nip46'; // Removed unused import
import { Buffer } from 'buffer'; // Import Buffer for hex conversion
// Import key generation from the correct submodule
import { getPublicKey, generateSecretKey } from 'nostr-tools/pure';
// Removed incorrect import: import { generatePrivateKey } from 'nostr-tools';
// Removed unused NDKFilter, NDKSubscriptionOptions from import
// Remove unused imports: NDK, NostrEvent, NDKUser, NDKSigner
import { NDKPrivateKeySigner, NDKNip46Signer, NDKEvent, NDKFilter, NDKSubscription } from '@nostr-dev-kit/ndk';
// Corrected import path - removed .ts extension
// Use specific helpers from idb export
import { idb, StoredNip46Data } from '../utils/idb';
// Import useNDK hook
import { useNDK } from '@nostr-dev-kit/ndk-hooks';
// Import the new helper
// import { bytesToHex } from '../utils/misc';

// Define default tags (can be customized)
const DEFAULT_FOLLOWED_TAGS = ['memes', 'landscape', 'photography', 'art', 'music', 'podcast'];

// Define the shape of the hook's return value
// Export the interface so it can be used externally
export interface UseAuthReturn {
    // Managed via state now
    currentUserNpub: string | null;
    // Keep nsec exposed for potential backup/export, but not core logic
    currentUserNsecForBackup: string | null;
    // isLoggedIn is derived from ndk.signer
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
    // Removed saveNsecToDb, handled internally by loginWithNsec
    // Removed getNdkSigner, NDK instance holds the signer directly
    // Removed signEvent, use ndk.signer.sign directly
    // Hashtag state and setter
    followedTags: string[];
    setFollowedTags: (tags: string[]) => void;
    // NIP-04 Methods using ndk.signer
    encryptDm: (recipientPubkeyHex: string, plaintext: string) => Promise<string>;
    decryptDm: (senderPubkeyHex: string, ciphertext: string) => Promise<string>;
}


// const APP_IDENTITY_NPUB = "npub1..."; // Use NDK's signer pubkey if available, or generate one
// const APP_IDENTITY_NSEC = "nsec1..."; // TODO: Ideally load from secure config, not hardcoded (Commented out as unused)

const NIP46_RELAYS = ['wss://nsec.app', 'wss://relay.damus.io', 'wss://relay.primal.net'];
const NIP46_CONNECT_TIMEOUT = 75000; // 75 seconds

// Remove NDK instance argument from the hook definition
export const useAuth = (): UseAuthReturn => {
    // Get NDK instance via hook
    const { ndk } = useNDK();

    // --- State ---
    const [currentUserNpub, setCurrentUserNpub] = useState<string | null>(null);
    const [currentUserNsecForBackup, setCurrentUserNsecForBackup] = useState<string | null>(null); // Keep for backup/display
    const [isLoadingAuth, setIsLoadingAuth] = useState<boolean>(true); // Start as true
    const [authError, setAuthError] = useState<string | null>(null);
    // NIP-46 connection state
    const [nip46ConnectUri, setNip46ConnectUri] = useState<string | null>(null); // State for the URI
    const [isGeneratingUri, setIsGeneratingUri] = useState<boolean>(false); // Loading state for URI generation
    // Refs for NIP-46 connection process
    const nip46TempPrivKeyRef = useRef<Uint8Array | null>(null);
    const nip46SubscriptionRef = useRef<NDKSubscription | null>(null);
    const nip46TimeoutRef = useRef<number | null>(null); // Use number for window.setTimeout ID
    const nip46SignerInstanceRef = useRef<NDKNip46Signer | null>(null); // Ref to hold the NIP-46 signer instance during connection
    // Followed tags state
    const [followedTags, setFollowedTagsState] = useState<string[]>(DEFAULT_FOLLOWED_TAGS); // Initialize with defaults

    // --- Derived State ---
    // Directly check ndk?.signer for login status
    // Add a check for ndk itself, though it should always be available
    // if useNDK is used correctly within a provider context.
    const isLoggedIn = !!ndk?.signer;
    // console.log(`useAuth: DIAGNOSTIC - isLoggedIn check (ndk?.signer exists?): ${isLoggedIn}`); // <-- DIAGNOSTIC LOG

    // --- Update npub state when signer changes ---
    useEffect(() => {
        const updateNpub = async () => {
            // Ensure ndk and ndk.signer exist before trying to get user
            if (ndk?.signer) {
                try {
                    const user = await ndk.signer.user();
                    setCurrentUserNpub(user.npub);
                    // console.log("useAuth: Updated currentUserNpub to", user.npub);
                } catch (error) {
                    console.error("useAuth: Failed to get user from signer:", error);
                    setCurrentUserNpub(null); // Clear npub on error
                }
            } else {
                setCurrentUserNpub(null);
                // console.log("useAuth: Cleared currentUserNpub (no signer).");
            }
        };
        // Only run if ndk is available
        if (ndk) {
            updateNpub();
        }
    }, [ndk?.signer]); // Re-run whenever the signer instance changes (check ndk too)


    // --- Hashtag Persistence (Mostly unchanged, uses specific idb helpers) ---
    const loadFollowedTags = useCallback(async () => {
        try {
            // Use specific helper
            const storedTags = await idb.loadFollowedTagsFromDb();
            if (storedTags && storedTags.length > 0) {
                 // console.log("Loaded followed tags from DB:", storedTags);
                return storedTags;
            } else {
                 // console.log("No stored tags found, using defaults initially.");
            }
        } catch (error) {
            console.error("Failed to load followed tags from IndexedDB:", error);
        }
        return DEFAULT_FOLLOWED_TAGS; // Return defaults if load fails or empty
    }, []);

     const saveFollowedTags = useCallback(async (tags: string[]) => {
        try {
            if (!Array.isArray(tags)) throw new Error("Invalid tags format: not an array.");
            const validTags = tags.filter(tag => typeof tag === 'string' && tag.trim().length > 0 && tag.length < 50);
            if (validTags.length !== tags.length) {
                console.warn("Some invalid tags were filtered before saving.");
            }
            // Use specific helper
            await idb.saveFollowedTagsToDb(validTags);
            // console.log("Saved followed tags to DB:", validTags);
        } catch (error) {
            console.error("Failed to save followed tags to IndexedDB:", error);
        }
     }, []);

     const setFollowedTags = useCallback((tags: string[]) => {
         setFollowedTagsState(tags);
         saveFollowedTags(tags);
     }, [saveFollowedTags]);


    // --- Nsec Persistence (Modified, uses specific idb helpers) ---

    // Loads nsec *only* for potential restoration if ndk.signer isn't set yet
    const loadNsecFromDb = useCallback(async (): Promise<string | null> => {
        // console.log("useAuth: DIAGNOSTIC - Attempting to load nsec from DB..."); // <-- DIAGNOSTIC LOG
        try {
            // Use specific helper
            const storedNsec = await idb.loadNsecFromDb();
            if (storedNsec) {
                if (storedNsec.startsWith('nsec1')) {
                    // console.log("useAuth: DIAGNOSTIC - Found potentially valid nsec in DB."); // <-- DIAGNOSTIC LOG
                    return storedNsec;
                } else {
                    console.error("Stored key is not a valid nsec format.");
                    await idb.clearNsecFromDb(); // Clear invalid data
                }
            } else {
                // console.log("useAuth: DIAGNOSTIC - No nsec found in DB."); // <-- DIAGNOSTIC LOG
            }
        } catch (error) {
            console.error("Failed to load nsec from IndexedDB:", error);
        }
        return null;
    }, []);

    // Saves nsec to DB and updates backup state
    const saveNsecToDbInternal = useCallback(async (nsec: string) => {
        try {
            if (!nsec.startsWith('nsec1')) throw new Error("Invalid nsec format.");
            const decoded = nip19.decode(nsec);
            if (decoded.type !== 'nsec') throw new Error("Decoded key is not nsec.");

            // Use specific helper
            await idb.saveNsecToDb(nsec);
            setCurrentUserNsecForBackup(nsec); // Update backup state
            console.log("Saved nsec to DB.");
        } catch (error) {
            console.error("Failed to save nsec to IndexedDB:", error);
            setAuthError("Failed to save login credentials.");
            throw error; // Re-throw to be caught by login function
        }
    }, []);

    // Clear nsec from DB and backup state
    const clearNsecFromDb = useCallback(async () => {
        try {
            // Use specific helper
            await idb.clearNsecFromDb();
            setCurrentUserNsecForBackup(null);
            console.log("Cleared nsec from DB.");
        } catch (error) {
            console.error("Failed to clear nsec from IndexedDB:", error);
        }
    }, []);

    // --- NIP-46 Persistence (uses specific idb helpers) ---

    const loadNip46DataFromDb = useCallback(async (): Promise<Omit<StoredNip46Data, 'id'> | null> => {
        try {
            const storedData = await idb.loadNip46DataFromDb();
            // Revert check: Rely on remoteNpub and token being present for restoration
            if (storedData?.remoteNpub && storedData.token) {
                return storedData;
            } else {
                 // console.log("useAuth: DIAGNOSTIC - No complete NIP-46 data found in DB (missing remoteNpub or token).");
            }
        } catch (error) {
            console.error("Failed to load NIP-46 data from IndexedDB:", error);
        }
        return null;
    }, []);

    const saveNip46DataToDb = useCallback(async (data: Omit<StoredNip46Data, 'id'>) => {
        try {
            await idb.saveNip46DataToDb(data);
            console.log("Saved NIP-46 connection data to DB for:", data.remoteNpub);
        } catch (error) {
            console.error("Failed to save NIP-46 data to IndexedDB:", error);
            setAuthError("Failed to save remote signer connection.");
            throw error;
        }
    }, []);

    const clearNip46DataFromDb = useCallback(async () => {
        try {
            // Use specific helper
            await idb.clearNip46DataFromDb();
            console.log("Cleared NIP-46 connection data from DB.");
        } catch (error) {
            console.error("Failed to clear NIP-46 data from IndexedDB:", error);
        }
    }, []);


    // --- Initialization Effect ---
    useEffect(() => {
        const initializeAuth = async () => {
            console.log("useAuth: Initializing authentication...");
            // Ensure ndk is ready before proceeding
            if (!ndk) {
                console.log("useAuth: NDK instance not ready yet, waiting...");
                // We might need a mechanism here to re-trigger init if ndk becomes available later,
                // but useNDK should provide it ready within the context.
                // Setting loading back to false might be premature if ndk isn't ready.
                // For now, assume ndk is ready or becomes ready triggering the effect.
                setIsLoadingAuth(false); // Or handle appropriately
                return;
            }

            // Check if already logged in (e.g., via previous action in this session)
            if (ndk.signer) {
                 console.log("useAuth: Already logged in (signer exists). Skipping storage check.");
                 setIsLoadingAuth(false);
                 // Load tags even if already logged in
                 const tags = await loadFollowedTags();
                 setFollowedTagsState(tags);
                 return;
            }

             console.log("useAuth: No active signer found, checking storage...");
             setAuthError(null); // Clear previous errors
             setIsLoadingAuth(true); // Ensure loading state is true during check

            try {
                const nip46Data = await loadNip46DataFromDb();
                // Revert logic: Use nip46Data.token as the source for the local secret key hex
                if (nip46Data?.remoteNpub && nip46Data.token) {
                    console.log("useAuth: Found stored NIP-46 data. Attempting to restore session using token as secret key for", nip46Data.remoteNpub);
                    try {
                        // Use the token field for the local secret key hex
                        const localSigner = new NDKPrivateKeySigner(nip46Data.token);
                        const restoredSigner = new NDKNip46Signer(ndk, nip46Data.remoteNpub, localSigner);
                        ndk.signer = restoredSigner;
                        const user = await restoredSigner.user();
                        console.log("useAuth: NIP-46 session restored successfully for user:", user.npub);
                        setCurrentUserNpub(user.npub);
                        setCurrentUserNsecForBackup(null);
                    } catch (restoreError) {
                        console.error("useAuth: Failed to restore NIP-46 session:", restoreError);
                        setAuthError("Failed to restore remote signer connection. Please log in again.");
                        await clearNip46DataFromDb();
                        if (ndk) ndk.signer = undefined;
                        setCurrentUserNpub(null);
                    }
                } else {
                    // 2. If no NIP-46 data, try loading nsec
                    console.log("useAuth: No complete NIP-46 data found, checking for nsec...");
                    const nsec = await loadNsecFromDb();
                    if (nsec) {
                        console.log("useAuth: Found stored nsec. Logging in...");
                        try {
                            const privateKeySigner = new NDKPrivateKeySigner(nsec);
                            ndk.signer = privateKeySigner;
                            const user = await ndk.signer.user();
                            console.log("useAuth: Logged in successfully with nsec for user:", user.npub);
                            setCurrentUserNpub(user.npub);
                            setCurrentUserNsecForBackup(nsec);
                        } catch (nsecError) {
                            console.error("useAuth: Failed to create signer from stored nsec:", nsecError);
                            setAuthError("Invalid stored login key. Please log in again.");
                            await clearNsecFromDb();
                            ndk.signer = undefined;
                            setCurrentUserNpub(null);
                            setCurrentUserNsecForBackup(null);
                        }
                    } else {
                        console.log("useAuth: No nsec found. User is not logged in.");
                        ndk.signer = undefined;
                        setCurrentUserNpub(null);
                        setCurrentUserNsecForBackup(null);
                    }
                }

                 // 3. Load followed tags regardless of login method
                 const tags = await loadFollowedTags();
                 setFollowedTagsState(tags);

        } catch (error) {
                console.error("useAuth: Error during auth initialization:", error);
                setAuthError("An error occurred during login check.");
                if (ndk) ndk.signer = undefined;
                setCurrentUserNpub(null);
                setCurrentUserNsecForBackup(null);
            } finally {
                setIsLoadingAuth(false); // Mark loading as complete
                console.log("useAuth: Auth initialization finished.");
            }
        };

        initializeAuth();

         // Cleanup function (optional, might not be needed here)
         return () => {
             // console.log("useAuth: Cleanup effect (if needed).");
         };
    // Add all dependencies used within the effect
    }, [ndk, loadNip46DataFromDb, loadNsecFromDb, clearNip46DataFromDb, clearNsecFromDb, loadFollowedTags, saveNip46DataToDb, saveNsecToDbInternal]); // Added save functions as they might be indirectly related via state updates if needed


    // --- Core Auth Logic (functions like generateNewKeys, loginWithNsec, initiateNip46Connection, logout) ---

    const loginWithNsec = useCallback(async (nsecInput: string): Promise<boolean> => {
        if (!ndk) {
            setAuthError("NDK not initialized.");
            console.error("useAuth: NDK instance not available in loginWithNsec.");
            return false;
        }
         setIsLoadingAuth(true);
         setAuthError(null);
        console.log("Attempting login with nsec...");
        try {
            const decoded = nip19.decode(nsecInput);
            if (decoded.type !== 'nsec' || !(decoded.data instanceof Uint8Array)) {
                throw new Error("Invalid nsec format provided.");
            }
            const privateKeySigner = new NDKPrivateKeySigner(nsecInput);
            ndk.signer = privateKeySigner;
            const user = await ndk.signer.user();
            console.log("Logged in with nsec, user:", user.npub);
            setCurrentUserNpub(user.npub);
            await saveNsecToDbInternal(nsecInput);
            await clearNip46DataFromDb();
            setIsLoadingAuth(false);
            return true;
        } catch (error) {
            console.error("Failed to login with nsec:", error);
            setAuthError(`Login failed: ${error instanceof Error ? error.message : String(error)}`);
            if (ndk) ndk.signer = undefined;
            setCurrentUserNpub(null);
            setCurrentUserNsecForBackup(null);
            setIsLoadingAuth(false);
            return false;
        }
    }, [ndk, saveNsecToDbInternal, clearNip46DataFromDb]);

    const generateNewKeys = useCallback(async (): Promise<{ npub: string; nsec: string } | null> => {
        console.log("Generating new keys...");
        setIsLoadingAuth(true);
        setAuthError(null);
        try {
            const skBytes = generateSecretKey();
            const pkHex = getPublicKey(skBytes);
            const nsec = nip19.nsecEncode(skBytes);
            const npub = nip19.npubEncode(pkHex);
            console.log("Generated new keys - npub:", npub);

            // Log in with the new nsec (Now defined above)
            const loggedIn = await loginWithNsec(nsec);
            if (loggedIn) {
                // loginWithNsec sets loading to false
                return { npub, nsec };
            } else {
                throw new Error("Failed to log in with newly generated keys.");
            }
        } catch (error) {
            console.error("Failed to generate or login with new keys:", error);
            setAuthError(`Key generation failed: ${error instanceof Error ? error.message : String(error)}`);
            setIsLoadingAuth(false);
            if(ndk) ndk.signer = undefined;
            setCurrentUserNpub(null);
            setCurrentUserNsecForBackup(null);
            return null;
        }
    }, [ndk, loginWithNsec]);

    const cancelNip46Connection = useCallback(() => {
        console.log("Cancelling NIP-46 connection attempt...");
        if (nip46TimeoutRef.current) {
            clearTimeout(nip46TimeoutRef.current);
            nip46TimeoutRef.current = null;
        }
        if (nip46SubscriptionRef.current) {
            nip46SubscriptionRef.current.stop();
            nip46SubscriptionRef.current = null;
        }
        nip46SignerInstanceRef.current = null;
        nip46TempPrivKeyRef.current = null;
        setIsGeneratingUri(false);
        setNip46ConnectUri(null);
    }, []);

    const initiateNip46Connection = useCallback(async () => {
        if (!ndk) {
            setAuthError("NDK not initialized.");
            console.error("useAuth: NDK instance not available in initiateNip46Connection.");
            setIsGeneratingUri(false);
            return;
        }
        console.log("Initiating NIP-46 connection...");
        setIsGeneratingUri(true);
        setAuthError(null);
        setNip46ConnectUri(null);
        cancelNip46Connection();

        try {
             // Generate a temporary local keypair for this connection attempt
             const localSecretKeyBytes = generateSecretKey();
             const localPublicKeyHex = getPublicKey(localSecretKeyBytes);
             const localSecretKeyHex = Buffer.from(localSecretKeyBytes).toString('hex');
             nip46TempPrivKeyRef.current = localSecretKeyBytes;
             const localSigner = new NDKPrivateKeySigner(localSecretKeyHex);

             // Create the nostrconnect URI
             const uriParams = new URLSearchParams();
             NIP46_RELAYS.forEach(relay => uriParams.append('relay', relay));
             uriParams.append('metadata', JSON.stringify({
                 name: "MadTrips TV App",
                 url: window.location.origin,
                 description: "Nostr media experience for your TV",
                 // icons: ["url_to_icon.png"]
             }));
             const connectUri = `nostr+connect://${localPublicKeyHex}?${uriParams.toString()}`;
             console.log("Generated NIP-46 Connect URI:", connectUri);
            setNip46ConnectUri(connectUri);

             // Create filter to listen for responses from the remote signer
             const filter: NDKFilter = {
                 kinds: [24133],
                 "#p": [localPublicKeyHex],
                 since: Math.floor(Date.now() / 1000) - 5,
             };
             console.log("Subscribing for NIP-46 connection response with filter:", filter);

              // Create the subscription
              const sub = ndk.subscribe(filter, { closeOnEose: false, groupable: false });
              nip46SubscriptionRef.current = sub;

             sub.on("event", async (event: NDKEvent) => {
                 if (!nip46TempPrivKeyRef.current) return;
                 try {
                     const remotePubkey = event.pubkey;
                     // Create NDKUser object for decryption
                     const remoteUser = ndk.getUser({ hexpubkey: remotePubkey });
                     const decryptedContent = await localSigner.decrypt(remoteUser, event.content);
                     const response = JSON.parse(decryptedContent);
                     console.log("Decrypted NIP-46 response:", response);

                     if (response.result && !response.error) {
                         console.log(`NIP-46 connection acknowledged by ${remotePubkey}. Finalizing...`);
                         if (nip46TimeoutRef.current) clearTimeout(nip46TimeoutRef.current);
                        if (nip46SubscriptionRef.current) nip46SubscriptionRef.current.stop();
                        nip46SubscriptionRef.current = null;
                nip46TimeoutRef.current = null;

                         // Create the *persistent* NDKNip46Signer using the remote pubkey and our local signer
                        const persistentNip46Signer = new NDKNip46Signer(ndk, remotePubkey, localSigner);
                        ndk.signer = persistentNip46Signer;
                        const user = await ndk.signer.user();
                        console.log("NIP-46 Signer set successfully for user:", user.npub);
                        setCurrentUserNpub(user.npub);

                         // Revert: Store localSecretKeyHex in the 'token' field
                        const nip46DataToStore: Omit<StoredNip46Data, 'id'> = {
                            remoteNpub: remotePubkey,
                            token: localSecretKeyHex, // Store local secret hex here
                            relay: NIP46_RELAYS[0],
                            // Remove explicit localSecretKeyHex field
                        };
                        await saveNip46DataToDb(nip46DataToStore);
            await clearNsecFromDb();
                        setCurrentUserNsecForBackup(null);

                         // Clear generating state, URI, temp key ref
                        setIsGeneratingUri(false);
            setNip46ConnectUri(null);
                        nip46TempPrivKeyRef.current = null;

                    } else if (response.error) {
                         console.error(`NIP-46 Error from ${remotePubkey}: ${response.error}`);
                    }
                 } catch (error) {
                     console.error("Error processing NIP-46 event:", error);
                 }
             });

             sub.on("eose", () => {
                 console.log("NIP-46 subscription EOSE received.");
                 // Keep listening if timeout hasn't occurred and connection not established.
             });

             // Start the connection timeout
             nip46TimeoutRef.current = window.setTimeout(() => {
                 if (!ndk.signer && nip46SubscriptionRef.current) {
                     console.warn("NIP-46 connection timed out.");
                     setAuthError("Remote sign-in request timed out. Please try again.");
                     cancelNip46Connection();
                 }
             }, NIP46_CONNECT_TIMEOUT);

        } catch (error) {
             console.error("Failed to initiate NIP-46 connection:", error);
             setAuthError(`Failed to start remote sign-in: ${error instanceof Error ? error.message : String(error)}`);
             cancelNip46Connection();
        }
    }, [ndk, cancelNip46Connection, saveNip46DataToDb, clearNsecFromDb]);

    const logout = useCallback(async () => {
        if (!ndk) {
            console.error("useAuth: NDK instance not available in logout.");
            return;
        }
        console.log("Logging out...");
        setIsLoadingAuth(true);
        setAuthError(null);
        ndk.signer = undefined;
        setCurrentUserNpub(null);
        setCurrentUserNsecForBackup(null);
        await clearNsecFromDb();
        await clearNip46DataFromDb();
        setIsLoadingAuth(false);
        console.log("Logout complete.");
    }, [ndk, clearNsecFromDb, clearNip46DataFromDb]);

    // --- NIP-04/44 Methods (Using NDK Signer) ---
    const encryptDm = useCallback(async (recipientPubkeyHex: string, plaintext: string): Promise<string> => {
        if (!ndk?.signer) throw new Error("Not logged in / Signer not available");
        try {
            const recipientUser = ndk.getUser({ hexpubkey: recipientPubkeyHex });
            return await ndk.signer.encrypt(recipientUser, plaintext);
        } catch (error) {
            console.error("Encryption failed:", error);
            throw new Error(`Encryption failed: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
    }, [ndk, ndk?.signer]);

    const decryptDm = useCallback(async (senderPubkeyHex: string, ciphertext: string): Promise<string> => {
        if (!ndk?.signer) throw new Error("Not logged in / Signer not available");
        try {
            const senderUser = ndk.getUser({ hexpubkey: senderPubkeyHex });
            return await ndk.signer.decrypt(senderUser, ciphertext);
        } catch (error) {
            console.error("Decryption failed:", error);
            throw new Error(`Decryption failed: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
    }, [ndk, ndk?.signer]);

    // --- Return Value ---
    return {
        currentUserNpub,
        currentUserNsecForBackup,
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
        followedTags,
        setFollowedTags,
        encryptDm,
        decryptDm,
    };
};