import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
// Remove NDK imports
// import NDK, { NDKPrivateKeySigner, NDKUser, NostrEvent, NDKRelaySet, NDKSubscription, NDKFilter, NDKEvent } from '@nostr-dev-kit/ndk';

// Nostr Tools imports (keep)
import * as nip19 from 'nostr-tools/nip19';
import * as nip04 from 'nostr-tools/nip04'; // Keep for now, may be replaced by signer methods
import { getPublicKey, generateSecretKey } from 'nostr-tools/pure';

// Applesauce imports
import { useStore } from 'applesauce-react';
import { QueryStore, SignerStore, NostrEvent } from 'applesauce-core'; // Assuming NostrEvent export exists
import { SimpleSigner, NostrConnectSigner, Signer } from 'applesauce-signers'; // Assuming Signer interface export

// Local Utils/Constants imports (replace placeholders with actual paths)
import { RELAYS, TV_PUBKEY_NPUB } from '../constants'; // Use RELAYS, import TV_PUBKEY_NPUB if needed later
import { logger } from '../utils/logger'; // Assuming this path is correct
import {
    loadNip46DataFromDb, // Use correct IDB function name
    saveNip46DataToDb,   // Use correct IDB function name
    clearNip46DataFromDb, // Use correct IDB function name
    loadNsecFromDb,      // Use correct exported name
    saveNsecToDb,        // Use correct exported name
    clearNsecFromDb,     // Use correct exported name
    StoredNip46Data      // Keep StoredNip46Data type from IDB for now
} from '../utils/idb';

// Buffer import (keep)
import { Buffer } from 'buffer';

// Updated Return Type
export interface UseAuthReturn {
    currentUserNpub: string | null;
    currentUserNsecForBackup: string | null; // Keep for backup UI
    isLoggedIn: boolean; // Derived from SignerStore
    isLoadingAuth: boolean;
    authError: string | null;
    nip46ConnectUri: string | null; // URI for NIP-46 connection QR code
    isGeneratingUri: boolean;
    initiateNip46Connection: () => Promise<void>;
    cancelNip46Connection: () => void;
    generateNewKeys: () => Promise<{ npub: string; nsec: string } | null>;
    loginWithNsec: (nsec: string) => Promise<boolean>;
    logout: () => Promise<void>;
    followedTags: string[];
    setFollowedTags: (tags: string[]) => void;
    // NIP-04 methods (will use active signer)
    encryptDm: (recipientPubkeyHex: string, plaintext: string) => Promise<string>;
    decryptDm: (senderPubkeyHex: string, ciphertext: string) => Promise<string>;
}

// Placeholder for signer instance during NIP-46 connection attempt
let activeNip46Signer: NostrConnectSigner | null = null;

// The hook itself - Remove ndkInstance prop
export const useAuth = (): UseAuthReturn => {
    // --- Get Stores from Context ---
    const queryStore = useStore(QueryStore);
    const signerStore = useStore(SignerStore);

    // --- State ---
    // Removed currentUserNpub state - will derive from signerStore
    // Removed isLoggedIn state - will derive from signerStore
    const [currentUserNsecForBackup, setCurrentUserNsecForBackup] = useState<string | null>(null); // Keep for backup UI
    const [isLoadingAuth, setIsLoadingAuth] = useState<boolean>(true);
    const [authError, setAuthError] = useState<string | null>(null);
    // NIP-46 connection state
    const [nip46ConnectUri, setNip46ConnectUri] = useState<string | null>(null); // State for the URI
    const [isGeneratingUri, setIsGeneratingUri] = useState<boolean>(false);
    // Refs/State for NIP-46 connection process (may simplify with Applesauce Signer)
    // const nip46TempPrivKeyRef = useRef<Uint8Array | null>(null); // Likely managed by NostrConnectSigner
    // const nip46SubscriptionRef = useRef<NDKSubscription | null>(null); // Handled by NostrConnectSigner
    // const nip46TimeoutRef = useRef<number | null>(null); // Handled by NostrConnectSigner
    const connectingNip46SignerRef = useRef<NostrConnectSigner | null>(null); // Ref to hold the signer *during* connection attempt

    // Followed tags state
    const [followedTags, setFollowedTagsState] = useState<string[]>([]); // Initialize with defaults

    // --- Derived State from SignerStore ---
    const activeSigner = signerStore.activeSigner;
    const isLoggedIn = !!activeSigner;
    const currentUserNpub = useMemo(() => {
        if (activeSigner?.pubkey) {
            try {
                return nip19.npubEncode(activeSigner.pubkey);
            } catch (e) {
                logger.error("Failed to encode active signer pubkey:", e);
                return null;
            }
        }        return null;
    }, [activeSigner]);

    // --- Load persisted tags --- (Keep existing logic, just use logger)
    useEffect(() => {
        // Load followed tags from IDB on mount
        // This is a placeholder - replace with actual IDB loading logic if needed
        // Example: loadTagsFromIdb().then(setFollowedTagsState);
        logger.info('Auth Hook: Mounted. (Need to load tags from IDB)');
        // Simulating loading for now
        // const loadedTags = await loadFollowedTags(); // Replace with actual call
        // setFollowedTagsState(loadedTags || []);
    }, []);

    // --- Persist tags on change --- (Keep existing logic, just use logger)
    const setFollowedTags = useCallback(async (tags: string[]) => {
        try {
            setFollowedTagsState(tags);
            // Persist tags to IDB
            // await saveFollowedTags(tags); // Replace with actual call
            logger.info('Persisted followed tags to IDB (placeholder)', tags);
        } catch (error) {
            logger.error('Failed to save followed tags:', error);
        }
    }, []);

    // --- NIP-46 Cleanup Logic ---
    const cleanupNip46Attempt = useCallback(async () => {
        logger.info('Cleaning up NIP-46 connection attempt...');
        if (connectingNip46SignerRef.current) {
            try {
                // NostrConnectSigner might have a specific close/disconnect method
                await connectingNip46SignerRef.current.disconnect(); // Assuming disconnect method
                logger.info('Disconnected NIP-46 signer instance.');
            } catch (e) {
                logger.error("Error disconnecting NIP-46 signer:", e);
            }
            connectingNip46SignerRef.current = null;
        }
        setNip46ConnectUri(null);
        setIsGeneratingUri(false);
    }, []);

    // --- NIP-46 Connection Initiation --- (Refactor needed)
    const initiateNip46Connection = useCallback(async () => {
        if (!queryStore || !signerStore) {
            setAuthError("Applesauce stores not available.");
            logger.error("useAuth: Stores not available in initiateNip46Connection.");
            setIsGeneratingUri(false);
            return;
        }
        logger.info("Initiating NIP-46 connection...");
        setIsGeneratingUri(true);
        setAuthError(null);
        setNip46ConnectUri(null);
        await cleanupNip46Attempt(); // Clean up any previous attempt

        try {
            // 1. Create a temporary local signer (SimpleSigner)
            const localSecretKeyBytes = generateSecretKey();
            const localSecretKeyHex = Buffer.from(localSecretKeyBytes).toString('hex');
            const localSigner = new SimpleSigner(localSecretKeyHex);

            // 2. Create the NostrConnectSigner instance
            const nip46Signer = new NostrConnectSigner({
                queryStore: queryStore,
                localSigner: localSigner,
                relays: RELAYS, // Use imported RELAYS constant
                // Optional: timeout, logger
                // timeout: 60000, // Example: 60 seconds
            });
            connectingNip46SignerRef.current = nip46Signer; // Store ref for cleanup

            // 3. Generate the connection URI
            const connectUri = nip46Signer.generateURI({
                metadata: {
                    name: "Nostr TV App", // Hardcoded App Name
                    url: window.location.origin,
                    description: "Nostr media experience for your TV",
                    // icons: ["url_to_icon.png"]
                },
                // Optional: Specify permissions if needed
                // permissions: ["nip04_encrypt", "nip04_decrypt", "sign_event"], // Example
            });
            logger.info("Generated NIP-46 Connect URI:", connectUri);
            setNip46ConnectUri(connectUri);

            // 4. Listen for the connection
            // This promise resolves when connected, rejects on error/timeout
            logger.info("Waiting for NIP-46 connection...");
            const connectedSigner = await nip46Signer.listen(); // This likely blocks until connection/error
            logger.info("NIP-46 connection successful!");

            // 5. Activate the connected signer in the SignerStore
            signerStore.activateSigner(connectedSigner);
            setCurrentUserNsecForBackup(null); // Clear any nsec backup

            // 6. Persist the session (REVISIT: Data mismatch between Applesauce and IDB type)
            // Applesauce provides: localSecretKeyHex, connectedSigner.remotePubkey, connectedSigner.pubkey
            // IDB stores: StoredNip46Data { id, remoteNpub, token, relay? }
            // For now, attempting to save what Applesauce provides, but using IDB function.
            // THIS WILL LIKELY FAIL OR NEED ADJUSTMENT in saveNip46DataToDb implementation.
            const sessionDataToSave: any = { // Using 'any' temporarily due to mismatch
                localSecret: localSecretKeyHex,
                remotePubkey: connectedSigner.remotePubkey, // Assuming property exists
                connectedUserPubkey: connectedSigner.pubkey, // Assuming property exists
                relays: RELAYS, // Save relays used
                // Missing: id, token? How is token managed in Applesauce signer?
            };
            logger.warn("Saving NIP-46 session data - REVISIT: Data structure mismatch between Applesauce signer and idb.ts saveNip46DataToDb", sessionDataToSave);
            await saveNip46DataToDb(sessionDataToSave); // Pass the potentially mismatched data
            logger.info("NIP-46 session persisted (potentially with incorrect structure).", sessionDataToSave);

            // 7. Clean up UI state
            setNip46ConnectUri(null);
            setIsGeneratingUri(false);
            connectingNip46SignerRef.current = null; // Clear ref as connection is complete

        } catch (error: any) {
            logger.error("NIP-46 Connection failed:", error);
            setAuthError(`NIP-46 Connection failed: ${error.message || 'Unknown error'}`);
            await cleanupNip46Attempt(); // Clean up fully on failure
        } finally {
            // Ensure loading state is reset if somehow missed
            setIsGeneratingUri(false);
        }
    }, [queryStore, signerStore, cleanupNip46Attempt]);

    // --- Cancel NIP-46 Connection ---
    const cancelNip46Connection = useCallback(() => {
        logger.info("Cancelling NIP-46 connection attempt...");
        // Cleanup function already handles disconnecting the signer instance
        cleanupNip46Attempt();
    }, [cleanupNip46Attempt]);

    // --- Login / Logout Logic ---
    const loginWithNsec = useCallback(async (nsec: string): Promise<boolean> => {
        if (!signerStore) {
            setAuthError("SignerStore not available.");
            logger.error("useAuth: SignerStore not available in loginWithNsec.");
            return false;
        }
        setIsLoadingAuth(true);
        setAuthError(null);
        logger.info("Attempting login with nsec...");
        await cleanupNip46Attempt();
        try {
            const decoded = nip19.decode(nsec);
            if (decoded.type !== 'nsec' || !(decoded.data instanceof Uint8Array)) {
                throw new Error("Invalid nsec format provided.");
            }
            const privateKeySigner = new SimpleSigner(nsec.trim());
            signerStore.activateSigner(privateKeySigner);
            const pubkey = privateKeySigner.pubkey;
            if (pubkey) {
                logger.info("Logged in with nsec, user:", nip19.npubEncode(pubkey));
            } else {
                logger.warn("Logged in with nsec, but could not get pubkey from SimpleSigner.");
            }
            setCurrentUserNsecForBackup(nsec.trim()); // Save for backup display
            // Clear persisted NIP-46 session
            await clearNip46DataFromDb();
            // Persist nsec
            await saveNsecToDb(nsec.trim());
            setIsLoadingAuth(false);
            return true;
        } catch (e: any) {
            logger.error("Error logging in with nsec:", e);
            setAuthError(`Login failed: ${e.message || 'Invalid nsec'}`);
            signerStore.activateSigner(undefined);
            setCurrentUserNpub(null);
            setCurrentUserNsecForBackup(null);
            await clearNsecFromDb();
            await clearNip46DataFromDb();
            setIsLoadingAuth(false);
            return false;
        }
    }, [signerStore, cleanupNip46Attempt]);

    const generateNewKeys = useCallback(async (): Promise<{ npub: string; nsec: string } | null> => {
        logger.info("Generating new keys...");
        setIsLoadingAuth(true);
        setAuthError(null);
        try {
            const skBytes = generateSecretKey();
            const pkHex = getPublicKey(skBytes);
            const nsec = nip19.nsecEncode(skBytes);
            const npub = nip19.npubEncode(pkHex);
            logger.info("Generated new keys - npub:", npub);

            // Log in with the new nsec (Now defined above)
            const loggedIn = await loginWithNsec(nsec);
            if (loggedIn) {
                // loginWithNsec sets loading to false
                return { npub, nsec };
            } else {
                throw new Error("Failed to log in with newly generated keys.");
            }
        } catch (error) {
            logger.error("Failed to generate or login with new keys:", error);
            setAuthError(`Key generation failed: ${error instanceof Error ? error.message : String(error)}`);
            setIsLoadingAuth(false);
            if(signerStore) signerStore.activateSigner(undefined);
            setCurrentUserNpub(null);
            setCurrentUserNsecForBackup(null);
            return null;
        }
    }, [signerStore, loginWithNsec]);

    const logout = useCallback(async () => {
        if (!signerStore) {
            logger.error("useAuth: SignerStore not available in logout.");
            return;
        }
        logger.info("Logging out...");
        setIsLoadingAuth(true);
        setAuthError(null);
        signerStore.activateSigner(undefined);
        setCurrentUserNpub(null);
        setCurrentUserNsecForBackup(null);
        await clearNsecFromDb();
        await clearNip46DataFromDb();
        setIsLoadingAuth(false);
        logger.info("Logout complete.");
    }, [signerStore]);

    // --- Initialization Effect ---
    useEffect(() => {
        const initializeAuth = async () => {
            logger.info("useAuth: Initializing authentication...");
            // Ensure signerStore is ready before proceeding
            if (!signerStore) {
                logger.info("useAuth: SignerStore not ready yet, waiting...");
                // We might need a mechanism here to re-trigger init if signerStore becomes available later,
                // but useSignerStore should provide it ready within the context.
                // Setting loading back to false might be premature if signerStore isn't ready.
                // For now, assume signerStore is ready or becomes ready triggering the effect.
                setIsLoadingAuth(false); // Or handle appropriately
                return;
            }

            // Check if already logged in (e.g., via previous action in this session)
            if (signerStore.activeSigner) {
                 logger.info("useAuth: Already logged in (signer exists). Skipping storage check.");
                 setIsLoadingAuth(false);
                 return;
            }

             logger.info("useAuth: No active signer found, checking storage...");
             setAuthError(null); // Clear previous errors
             setIsLoadingAuth(true); // Ensure loading state is true during check

            try {
                const persistedNip46 = await loadNip46DataFromDb();
                if (persistedNip46) {
                    logger.info("Found persisted NIP-46 session. Attempting to restore...");
                    try {
                        // Create local signer from persisted data
                        const localSigner = new SimpleSigner(persistedNip46.localSecret);
                        signerStore.activateSigner(localSigner);

                        // Create NostrConnectSigner using SignerStore methods
                        const signer = new NostrConnectSigner({
                            queryStore: queryStore,
                            localSigner: localSigner,
                            relays: RELAYS, // Save relays used for connection
                        });
                        signerStore.activateSigner(signer);
                        // Verify connection
                        if (signer.connected) {
                            logger.info("NIP-46 session restored successfully for user:", persistedNip46.connectedUserPubkey);
                            // Update state
                            setCurrentUserNpub(persistedNip46.connectedUserPubkey);
                            setCurrentUserNsecForBackup(null);
                        } else {
                            logger.error("Failed to restore NIP-46 session: signer not connected.");
                            // Clear invalid persisted data
                            await clearNip46DataFromDb();
                            signerStore.activateSigner(undefined);
                        }
                    } catch (e: any) { // Add :any type
                        logger.error("Failed to restore NIP-46 session:", e);
                        // Clear invalid persisted data
                        await clearNip46DataFromDb();
                        signerStore.activateSigner(undefined);
                    }
                } else {
                    // 2. If no NIP-46 data, try loading nsec
                    logger.info("useAuth: No complete NIP-46 data found, checking for nsec...");
                    const nsec = await loadNsecFromDb();
                    if (nsec) {
                        logger.info("useAuth: Found stored nsec. Logging in...");
                        try {
                            const privateKeySigner = new SimpleSigner(nsec);
                            signerStore.activateSigner(privateKeySigner);
                            // Assuming SimpleSigner provides pubkey
                            const pubkey = privateKeySigner.pubkey;
                            if (pubkey) {
                                logger.info("useAuth: Logged in successfully with nsec for user:", nip19.npubEncode(pubkey));
                                setCurrentUserNsecForBackup(nsec); // Set backup nsec
                                // Do not set currentUserNpub directly, derived state handles it
                            } else {
                                logger.error("useAuth: Created SimpleSigner but failed to get pubkey.");
                                throw new Error("Failed to derive public key from stored nsec.");
                            }
                        } catch (nsecError) {
                            logger.error("useAuth: Failed to create signer from stored nsec:", nsecError);
                            setAuthError("Invalid stored login key. Please log in again.");
                            await clearNsecFromDb(); // Use correct name
                            signerStore.activateSigner(undefined);
                            setCurrentUserNsecForBackup(null);
                        }
                    } else {
                        logger.info("useAuth: No nsec found. User is not logged in.");
                        signerStore.activateSigner(undefined);
                        setCurrentUserNpub(null);
                        setCurrentUserNsecForBackup(null);
                    }
                }

            } catch (error) {
                logger.error("useAuth: Error during auth initialization:", error);
                setAuthError("An error occurred during login check.");
                if (signerStore) signerStore.activateSigner(undefined);
                setCurrentUserNpub(null);
                setCurrentUserNsecForBackup(null);
            } finally {
                setIsLoadingAuth(false); // Mark loading as complete
                logger.info("useAuth: Auth initialization finished.");
            }
        }; // End of initializeAuth

        initializeAuth();

         // Cleanup function (optional, might not be needed here)
         return () => {
             // logger.info("useAuth: Cleanup effect (if needed).");
         };
    // Add all dependencies used within the effect
    }, [signerStore, queryStore]);

    // --- NIP-04 DM Helpers ---
    const encryptDm = useCallback(async (recipientNpub: string, content: string): Promise<string> => {
        if (!signerStore) throw new Error("Not logged in / Signer not available");
        let recipientHex: string;
        try {
            recipientHex = nip19.decode(recipientNpub.trim()).data as string;
            if (typeof recipientHex !== 'string' || !/^[0-9a-f]{64}$/.test(recipientHex)) {
                 throw new Error("Invalid recipient npub format.");
            }
        } catch (e: any) { // Add :any type
             throw new Error(`Invalid recipient npub: ${e.message}`);
        }
        try {
            const recipientUser = signerStore.getUser({ hexpubkey: recipientHex });
            return await signerStore.encrypt(recipientUser, content);
        } catch (error) {
            logger.error("Encryption failed:", error);
            throw new Error(`Encryption failed: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
    }, [signerStore]); // Dependency is implicitly signerStore via activeSignerRef updates

     const decryptDm = useCallback(async (senderNpub: string, encryptedContent: string): Promise<string> => {
        if (!signerStore) throw new Error("Not logged in / Signer not available");
        let senderHex: string;
        try {
            senderHex = nip19.decode(senderNpub.trim()).data as string;
            if (typeof senderHex !== 'string' || !/^[0-9a-f]{64}$/.test(senderHex)) {
                 throw new Error("Invalid sender npub format.");
            }
         } catch (e: any) { // Add :any type
             throw new Error(`Invalid sender npub: ${e.message}`);
         }
         try {
            const senderUser = signerStore.getUser({ hexpubkey: senderHex });
            return await signerStore.decrypt(senderUser, encryptedContent);
        } catch (error) {
            logger.error("Decryption failed:", error);
            throw new Error(`Decryption failed: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
    }, [signerStore]); // Dependency is implicitly signerStore via activeSignerRef updates


    // --- Return hook state and methods ---
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
        setFollowedTags: (tags: string[]) => {
            setFollowedTagsState(tags);
        },
        encryptDm,
        decryptDm,
    };
};