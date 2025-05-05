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

// Local Utils/Constants imports
import { RELAYS, TV_PUBKEY_NPUB } from '../constants';
import {
    loadNip46DataFromDb,
    saveNip46DataToDb,
    clearNip46DataFromDb,
    loadNsecFromDb,
    saveNsecToDb,
    clearNsecFromDb,
    StoredNip46Data
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
                // console.error or handle silently
                console.error("Failed to encode active signer pubkey:", e);
                return null;
            }
        }
        return null;
    }, [activeSigner]);

    // --- Load persisted tags --- (Removed logger)
    useEffect(() => {
        // Load followed tags from IDB on mount (Placeholder)
        console.info('Auth Hook: Mounted. (Need to load tags from IDB)');
    }, []);

    // --- Persist tags on change --- (Removed logger)
    const setFollowedTags = useCallback(async (tags: string[]) => {
        try {
            setFollowedTagsState(tags);
            // Persist tags to IDB (Placeholder)
            console.info('Persisted followed tags to IDB (placeholder)', tags);
        } catch (error) {
            console.error('Failed to save followed tags:', error);
        }
    }, []);

    // --- NIP-46 Cleanup Logic --- (Removed logger)
    const cleanupNip46Attempt = useCallback(async () => {
        console.info('Cleaning up NIP-46 connection attempt...');
        if (connectingNip46SignerRef.current) {
            try {
                await connectingNip46SignerRef.current.disconnect();
                console.info('Disconnected NIP-46 signer instance.');
            } catch (e) {
                console.error("Error disconnecting NIP-46 signer:", e);
            }
            connectingNip46SignerRef.current = null;
        }
        setNip46ConnectUri(null);
        setIsGeneratingUri(false);
    }, []);

    // --- NIP-46 Connection Initiation --- (Removed logger)
    const initiateNip46Connection = useCallback(async () => {
        if (!queryStore || !signerStore) {
            setAuthError("Applesauce stores not available.");
            console.error("useAuth: Stores not available in initiateNip46Connection.");
            setIsGeneratingUri(false);
            return;
        }
        console.info("Initiating NIP-46 connection...");
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
            console.info("Generated NIP-46 Connect URI:", connectUri);
            setNip46ConnectUri(connectUri);

            // 4. Listen for the connection
            // This promise resolves when connected, rejects on error/timeout
            console.info("Waiting for NIP-46 connection...");
            const connectedSigner = await nip46Signer.listen(); // This likely blocks until connection/error
            console.info("NIP-46 connection successful!");

            // 5. Activate the connected signer in the SignerStore
            signerStore.activateSigner(connectedSigner);
            setCurrentUserNsecForBackup(null); // Clear any nsec backup

            // 6. Persist the session with the correct structure
            const sessionDataToSave: Omit<StoredNip46Data, 'id'> = {
                localSecret: localSecretKeyHex,
                remotePubkey: connectedSigner.remotePubkey,
                connectedUserPubkey: connectedSigner.pubkey,
                relays: RELAYS,
            };
            await saveNip46DataToDb(sessionDataToSave);
            console.info("NIP-46 session persisted.");

            // 7. Clean up UI state
            setNip46ConnectUri(null);
            setIsGeneratingUri(false);
            connectingNip46SignerRef.current = null; // Clear ref as connection is complete

        } catch (error: any) {
            console.error("NIP-46 Connection failed:", error);
            setAuthError(`NIP-46 Connection failed: ${error.message || 'Unknown error'}`);
            await cleanupNip46Attempt(); // Clean up fully on failure
        } finally {
            // Ensure loading state is reset if somehow missed
            setIsGeneratingUri(false);
        }
    }, [queryStore, signerStore, cleanupNip46Attempt]);

    // --- Cancel NIP-46 Connection --- (Removed logger)
    const cancelNip46Connection = useCallback(() => {
        console.info("Cancelling NIP-46 connection attempt...");
        // Cleanup function already handles disconnecting the signer instance
        cleanupNip46Attempt();
    }, [cleanupNip46Attempt]);

    // --- Login / Logout Logic --- (Removed logger, removed setCurrentUserNpub)
    const loginWithNsec = useCallback(async (nsec: string): Promise<boolean> => {
        if (!signerStore) {
            setAuthError("SignerStore not available.");
            console.error("useAuth: SignerStore not available in loginWithNsec.");
            return false;
        }
        setIsLoadingAuth(true);
        setAuthError(null);
        console.info("Attempting login with nsec...");
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
                console.info("Logged in with nsec, user:", nip19.npubEncode(pubkey));
            } else {
                console.warn("Logged in with nsec, but could not get pubkey from SimpleSigner.");
            }
            setCurrentUserNsecForBackup(nsec.trim());
            await clearNip46DataFromDb();
            await saveNsecToDb(nsec.trim());
            setIsLoadingAuth(false);
            return true;
        } catch (e: any) {
            console.error("Error logging in with nsec:", e);
            setAuthError(`Login failed: ${e.message || 'Invalid nsec'}`);
            signerStore.activateSigner(undefined);
            setCurrentUserNsecForBackup(null);
            await clearNsecFromDb();
            await clearNip46DataFromDb();
            setIsLoadingAuth(false);
            return false;
        }
    }, [signerStore, cleanupNip46Attempt]);

    const generateNewKeys = useCallback(async (): Promise<{ npub: string; nsec: string } | null> => {
        console.info("Generating new keys...");
        setIsLoadingAuth(true);
        setAuthError(null);
        try {
            const skBytes = generateSecretKey();
            const pkHex = getPublicKey(skBytes);
            const nsec = nip19.nsecEncode(skBytes);
            const npub = nip19.npubEncode(pkHex);
            console.info("Generated new keys - npub:", npub);

            const loggedIn = await loginWithNsec(nsec);
            if (loggedIn) {
                return { npub, nsec };
            } else {
                throw new Error("Failed to log in with newly generated keys.");
            }
        } catch (error) {
            console.error("Failed to generate or login with new keys:", error);
            setAuthError(`Key generation failed: ${error instanceof Error ? error.message : String(error)}`);
            setIsLoadingAuth(false);
            if(signerStore) signerStore.activateSigner(undefined);
            setCurrentUserNsecForBackup(null);
            return null;
        }
    }, [signerStore, loginWithNsec]);

    const logout = useCallback(async () => {
        if (!signerStore) {
            console.error("useAuth: SignerStore not available in logout.");
            return;
        }
        console.info("Logging out...");
        setIsLoadingAuth(true);
        setAuthError(null);
        signerStore.activateSigner(undefined);
        setCurrentUserNsecForBackup(null);
        await clearNsecFromDb();
        await clearNip46DataFromDb();
        setIsLoadingAuth(false);
        console.info("Logout complete.");
    }, [signerStore]);

    // --- Initialization Effect --- (Removed logger, removed setCurrentUserNpub)
    useEffect(() => {
        const initializeAuth = async () => {
            console.info("useAuth: Initializing authentication...");
            if (!signerStore || !queryStore) { // Also check queryStore for NIP-46 restore
                console.info("useAuth: Stores not ready yet, waiting...");
                setIsLoadingAuth(false);
                return;
            }
            if (signerStore.activeSigner) {
                 console.info("useAuth: Already logged in (signer exists). Skipping storage check.");
                 setIsLoadingAuth(false);
                 return;
            }
            console.info("useAuth: No active signer found, checking storage...");
            setAuthError(null);
            setIsLoadingAuth(true);

            try {
                const persistedNip46 = await loadNip46DataFromDb();
                if (persistedNip46) {
                    console.info("Found persisted NIP-46 session. Attempting to restore...");
                    try {
                        // Recreate local signer from persisted secret
                        const localSigner = new SimpleSigner(persistedNip46.localSecret);

                        // Recreate NostrConnectSigner instance for reconnection/verification
                        const signer = new NostrConnectSigner({
                            queryStore: queryStore,
                            localSigner: localSigner,
                            remotePubkey: persistedNip46.remotePubkey, // Provide remote pubkey
                            relays: persistedNip46.relays || RELAYS, // Use stored or default relays
                            // Note: We don't provide connectedUserPubkey here,
                            // the signer gets it upon successful (re)connection/auth
                        });

                        // Attempt to implicitly connect/verify by activating
                        // Assuming activateSigner handles potential connection errors
                        // OR NostrConnectSigner might need an explicit connect()/authenticate() call
                        // Check Applesauce docs for restoring NostrConnectSigner
                        console.info("Activating restored NIP-46 signer...");
                        signerStore.activateSigner(signer);

                        // We might need to wait/check connection status here.
                        // For now, assume activation implies successful restoration if no error.
                        // Check if signer.pubkey matches the persisted one after activation?
                        if (signerStore.activeSigner?.pubkey === persistedNip46.connectedUserPubkey) {
                             console.info("NIP-46 session restored successfully for user:", nip19.npubEncode(persistedNip46.connectedUserPubkey));
                             setCurrentUserNsecForBackup(null);
                        } else {
                             console.error("Failed to restore NIP-46 session: Pubkey mismatch or connection failed after activation.");
                             await clearNip46DataFromDb();
                             signerStore.activateSigner(undefined);
                        }
                    } catch (e: any) {
                        console.error("Failed to restore NIP-46 session:", e);
                        await clearNip46DataFromDb();
                        signerStore.activateSigner(undefined);
                    }
                } else {
                    // Try loading nsec if no NIP-46 session
                    console.info("useAuth: No complete NIP-46 data found, checking for nsec...");
                    const nsec = await loadNsecFromDb();
                    if (nsec) {
                        console.info("useAuth: Found stored nsec. Logging in...");
                        try {
                            const privateKeySigner = new SimpleSigner(nsec);
                            signerStore.activateSigner(privateKeySigner);
                            const pubkey = privateKeySigner.pubkey;
                            if (pubkey) {
                                console.info("useAuth: Logged in successfully with nsec for user:", nip19.npubEncode(pubkey));
                                setCurrentUserNsecForBackup(nsec);
                            } else {
                                console.error("useAuth: Created SimpleSigner but failed to get pubkey.");
                                throw new Error("Failed to derive public key from stored nsec.");
                            }
                        } catch (nsecError) {
                            console.error("useAuth: Failed to create signer from stored nsec:", nsecError);
                            setAuthError("Invalid stored login key. Please log in again.");
                            await clearNsecFromDb();
                            signerStore.activateSigner(undefined);
                            setCurrentUserNsecForBackup(null);
                        }
                    } else {
                        console.info("useAuth: No nsec found. User is not logged in.");
                        signerStore.activateSigner(undefined);
                        setCurrentUserNsecForBackup(null);
                    }
                }

            } catch (error) {
                console.error("useAuth: Error during auth initialization:", error);
                setAuthError("An error occurred during login check.");
                if (signerStore) signerStore.activateSigner(undefined);
                setCurrentUserNsecForBackup(null);
            } finally {
                setIsLoadingAuth(false);
                console.info("useAuth: Auth initialization finished.");
            }
        }; // End of initializeAuth

        initializeAuth();

         return () => {
             // console.info("useAuth: Cleanup effect (if needed).");
         };
    }, [signerStore, queryStore]); // Dependencies updated

    // --- NIP-04 DM Helpers --- (Removed logger)
    const encryptDm = useCallback(async (recipientNpub: string, content: string): Promise<string> => {
        const currentSigner = signerStore?.activeSigner;
        if (!currentSigner) throw new Error("Not logged in / Signer not available");
        if (!currentSigner.encrypt) throw new Error("Active signer does not support NIP-04 encryption");

        let recipientHex: string;
        try {
            const decoded = nip19.decode(recipientNpub.trim());
            if (decoded.type !== 'npub') throw new Error("Invalid recipient format (expected npub)");
            recipientHex = decoded.data as string;
        } catch (e: any) {
             throw new Error(`Invalid recipient npub: ${e.message}`);
        }
        try {
            // Applesauce signer encrypt method likely takes hex pubkey directly
            return await currentSigner.encrypt(recipientHex, content);
        } catch (error) {
            console.error("Encryption failed:", error);
            throw new Error(`Encryption failed: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
    }, [signerStore]); // Dependency only on signerStore

     const decryptDm = useCallback(async (senderNpub: string, encryptedContent: string): Promise<string> => {
        const currentSigner = signerStore?.activeSigner;
        if (!currentSigner) throw new Error("Not logged in / Signer not available");
        if (!currentSigner.decrypt) throw new Error("Active signer does not support NIP-04 decryption");

        let senderHex: string;
        try {
            const decoded = nip19.decode(senderNpub.trim());
            if (decoded.type !== 'npub') throw new Error("Invalid sender format (expected npub)");
            senderHex = decoded.data as string;
         } catch (e: any) {
             throw new Error(`Invalid sender npub: ${e.message}`);
         }
         try {
             // Applesauce signer decrypt method likely takes hex pubkey directly
            return await currentSigner.decrypt(senderHex, encryptedContent);
        } catch (error) {
            console.error("Decryption failed:", error);
            throw new Error(`Decryption failed: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
    }, [signerStore]); // Dependency only on signerStore

    // --- Return hook state and methods --- (Updated setFollowedTags)
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
        setFollowedTags, // Use the useCallback version defined earlier
        encryptDm,
        decryptDm,
    };
};