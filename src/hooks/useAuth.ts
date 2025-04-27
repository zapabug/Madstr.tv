import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import * as nip19 from 'nostr-tools/nip19';
import * as nip04 from 'nostr-tools/nip04';
// import * as nip46 from 'nostr-tools/nip46'; // Removed unused import
// import { Buffer } from 'buffer';
// Import key generation from the correct submodule
import { getPublicKey, generateSecretKey } from 'nostr-tools/pure';
// Removed incorrect import: import { generatePrivateKey } from 'nostr-tools';
// Removed unused NDKFilter, NDKSubscriptionOptions from import
// <<< Remove NDK import if no longer directly needed after param change >>>
// import { NDKPrivateKeySigner, NDKNip46Signer, NDKEvent, NostrEvent, NDKFilter, NDKSubscription, NDK } from '@nostr-dev-kit/ndk';
// <<< Fix NDK type import: Use default import for the type >>>
import NDK, { NDKPrivateKeySigner, NDKNip46Signer, NDKEvent, NostrEvent, NDKFilter, NDKSubscription } from '@nostr-dev-kit/ndk';
// Removed incorrect import path - removed .ts extension
import { idb } from '../utils/idb';
// Import the constants
import { RELAYS, DEFAULT_TIP_AMOUNT_SATS } from '../constants'; // Import main RELAYS
// Import the new helper
// import { bytesToHex } from '../utils/misc';

// Define default tags (can be customized)
export const DEFAULT_FOLLOWED_TAGS = ['memes', 'landscape', 'photography', 'art', 'music', 'podcast', 'madeira'];
const DEFAULT_FETCH_IMAGES_BY_TAG = true; // <<< New default
const DEFAULT_FETCH_VIDEOS_BY_TAG = true; // <<< New default for videos
const DEFAULT_FETCH_PODCASTS_BY_TAG = false; // Default to false for podcasts?

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
    // Image Fetch Toggle <<< Add new state and setter >>>
    fetchImagesByTagEnabled: boolean;
    setFetchImagesByTagEnabled: (enabled: boolean) => void;
    // <<< Add video toggle state and setter >>>
    fetchVideosByTagEnabled: boolean;
    setFetchVideosByTagEnabled: (enabled: boolean) => void;
    // <<< Add podcast toggle state and setter >>>
    fetchPodcastsByTagEnabled: boolean;
    setFetchPodcastsByTagEnabled: (enabled: boolean) => void;
    // <<< Add default tip amount state and setter >>>
    defaultTipAmount: number;
    setDefaultTipAmount: (amount: number) => void;
    // NIP-04 Methods
    encryptDm: (recipientPubkeyHex: string, plaintext: string) => Promise<string>;
    decryptDm: (senderPubkeyHex: string, ciphertext: string) => Promise<string>;
}

// Placeholder for the TV App's identity. Generate one if needed on first load?
// Or require setting via config/env. Using a placeholder for now.
// const APP_IDENTITY_NPUB = "npub1..."; // Use NDK's signer pubkey if available, or generate one
// const APP_IDENTITY_NSEC = "nsec1..."; // TODO: Ideally load from secure config, not hardcoded (Commented out as unused)

// Remove the local NIP46_RELAYS constant, use RELAYS from constants.ts
// const NIP46_RELAYS = ['wss://relay.nsec.app', 'wss://relay.damus.io', 'wss://relay.primal.net'];
const NIP46_CONNECT_TIMEOUT = 75000; // 75 seconds

// <<< Accept NDK instance and readiness flag as parameters >>>
export const useAuth = (ndkInstance: NDK | undefined, isNdkReady: boolean): UseAuthReturn => {
    // <<< Remove internal useNdk call >>>
    // const { ndk } = useNdk(); // <<< Corrected hook name (lowercase d)

    const [currentUserNpub, setCurrentUserNpub] = useState<string | null>(null);
    const [currentUserNsec, setCurrentUserNsec] = useState<string | null>(null);
    const [nip46SignerPubkey, setNip46SignerPubkey] = useState<string | null>(null); // Store hex pubkey
    const [isLoadingAuth, setIsLoadingAuth] = useState<boolean>(true);
    const [authError, setAuthError] = useState<string | null>(null);
    const nip46TempPrivKeyRef = useRef<Uint8Array | null>(null);
    const nip46SubscriptionRef = useRef<NDKSubscription | null>(null);
    const nip46TimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const [nip46ConnectUri, setNip46ConnectUri] = useState<string | null>(null);
    const [isGeneratingUri, setIsGeneratingUri] = useState<boolean>(false);
    const [followedTags, setFollowedTagsState] = useState<string[]>(DEFAULT_FOLLOWED_TAGS);
    const [fetchImagesByTagEnabled, setFetchImagesByTagEnabledState] = useState<boolean>(DEFAULT_FETCH_IMAGES_BY_TAG);
    // <<< Add state for video toggle >>>
    const [fetchVideosByTagEnabled, setFetchVideosByTagEnabledState] = useState<boolean>(DEFAULT_FETCH_VIDEOS_BY_TAG);
    // <<< Add podcast toggle state >>>
    const [fetchPodcastsByTagEnabled, setFetchPodcastsByTagEnabledState] = useState<boolean>(DEFAULT_FETCH_PODCASTS_BY_TAG);
    // <<< Add state for default tip amount >>>
    const [defaultTipAmount, setDefaultTipAmountState] = useState<number>(DEFAULT_TIP_AMOUNT_SATS);

    const isLoggedIn = !!(currentUserNpub && (currentUserNsec || nip46SignerPubkey));

    // --- Persistence Helpers ---
    const loadFollowedTags = useCallback(async () => idb.loadFollowedTagsFromDb(), []);
    const saveFollowedTags = useCallback(async (tags: string[]) => {
        try {
            const validTags = tags.filter(tag => typeof tag === 'string' && tag.trim().length > 0 && tag.length < 50);
            if (validTags.length !== tags.length) console.warn("Filtered invalid tags");
            await idb.saveFollowedTagsToDb(validTags);
        } catch (error) { console.error("Failed to save tags:", error); }
    }, []);
    const setFollowedTags = useCallback((tags: string[]) => {
        setFollowedTagsState(tags);
        saveFollowedTags(tags);
    }, [saveFollowedTags]);

    const loadFetchImagesByTag = useCallback(async () => idb.loadFetchImagesByTagEnabledFromDb(), []);
    const saveFetchImagesByTag = useCallback(async (enabled: boolean) => {
        await idb.saveFetchImagesByTagEnabledToDb(enabled);
    }, []);
    const setFetchImagesByTagEnabled = useCallback((enabled: boolean) => {
        setFetchImagesByTagEnabledState(enabled);
        saveFetchImagesByTag(enabled);
    }, [saveFetchImagesByTag]);

    // <<< Add load/save/setter for video toggle >>>
    const loadFetchVideosByTag = useCallback(async () => idb.loadFetchVideosByTagEnabledFromDb(), []);
    const saveFetchVideosByTag = useCallback(async (enabled: boolean) => {
        await idb.saveFetchVideosByTagEnabledToDb(enabled);
    }, []);
    const setFetchVideosByTagEnabled = useCallback((enabled: boolean) => {
        setFetchVideosByTagEnabledState(enabled);
        saveFetchVideosByTag(enabled);
    }, [saveFetchVideosByTag]);

    // <<< Add load/save/setter for podcast toggle >>>
    const loadFetchPodcastsByTag = useCallback(async () => idb.loadFetchPodcastsByTagEnabledFromDb(), []);
    const saveFetchPodcastsByTag = useCallback(async (enabled: boolean) => {
        await idb.saveFetchPodcastsByTagEnabledToDb(enabled);
    }, []);
    const setFetchPodcastsByTagEnabled = useCallback((enabled: boolean) => {
        setFetchPodcastsByTagEnabledState(enabled);
        saveFetchPodcastsByTag(enabled);
    }, [saveFetchPodcastsByTag]);

    // <<< Add load/save/setter for default tip amount >>>
    const loadDefaultTipAmount = useCallback(async () => idb.loadDefaultTipAmountFromDb(), []);
    const saveDefaultTipAmount = useCallback(async (amount: number) => {
        // Basic validation
        if (typeof amount === 'number' && amount > 0 && Number.isInteger(amount)) {
            await idb.saveDefaultTipAmountToDb(amount);
        } else {
            console.warn("Invalid tip amount provided for saving:", amount);
        }
    }, []);
    const setDefaultTipAmount = useCallback((amount: number) => {
         // Basic validation before setting state
        if (typeof amount === 'number' && amount > 0 && Number.isInteger(amount)) {
            setDefaultTipAmountState(amount);
            saveDefaultTipAmount(amount);
        } else {
             console.warn("Invalid tip amount provided for setting:", amount);
        }
    }, [saveDefaultTipAmount]);

    const clearNsecFromDb = useCallback(async () => idb.clearNsecFromDb(), []);
    const loadNsecFromDb = useCallback(async () => {
        const loadedNsec = await idb.loadNsecFromDb();
        if (loadedNsec) {
            try {
                const decoded = nip19.decode(loadedNsec);
                if (decoded.type === 'nsec') {
                    const pkHex = getPublicKey(decoded.data as Uint8Array);
                    setCurrentUserNsec(loadedNsec);
                    setCurrentUserNpub(nip19.npubEncode(pkHex));
                    setNip46SignerPubkey(null); // Ensure NIP-46 is cleared
                    console.log("Loaded nsec for:", nip19.npubEncode(pkHex));
                    return loadedNsec;
                } else { await clearNsecFromDb(); }
            } catch (e) { console.error("Error processing nsec:", e); await clearNsecFromDb(); }
        }
        return null;
    }, [clearNsecFromDb]); // Dependency needed

    // Internal save function used by login
    const saveNsecInternal = useCallback(async (nsec: string) => {
        try {
            if (!nsec.startsWith('nsec1')) throw new Error("Invalid nsec format.");
            const decoded = nip19.decode(nsec);
            if (decoded.type !== 'nsec') throw new Error("Decoded key is not nsec.");
            await idb.saveNsecToDb(nsec);
            const pkHex = getPublicKey(decoded.data as Uint8Array);
            setCurrentUserNsec(nsec); setCurrentUserNpub(nip19.npubEncode(pkHex)); setNip46SignerPubkey(null); setAuthError(null);

            // Load/set ALL settings
            const tags = await loadFollowedTags();
            const imagePref = await loadFetchImagesByTag();
            const videoPref = await loadFetchVideosByTag();
            const podcastPref = await loadFetchPodcastsByTag(); // <<< Load podcast pref
            const tipPref = await loadDefaultTipAmount();
            setFollowedTagsState(tags || []);
            setFetchImagesByTagEnabledState(imagePref);
            setFetchVideosByTagEnabledState(videoPref);
            setFetchPodcastsByTagEnabledState(podcastPref); // <<< Set podcast pref state
            setDefaultTipAmountState(tipPref);
            console.log("Nsec saved and ALL settings loaded.");
        } catch (error) {
            console.error("Failed to save nsec:", error);
            setAuthError("Failed to save login credentials.");
            throw error; // Re-throw
        }
    }, [loadFollowedTags, loadFetchImagesByTag, loadFetchVideosByTag, loadFetchPodcastsByTag, loadDefaultTipAmount]); // Dependencies

    const loginWithNsec = useCallback(async (nsecInput: string): Promise<boolean> => {
        setIsLoadingAuth(true); setAuthError(null);
        try {
            await saveNsecInternal(nsecInput);
            setIsLoadingAuth(false); return true;
        } catch (error: any) {
            console.error("Login with nsec failed:", error);
            setAuthError(error.message || "Invalid nsec provided.");
            setCurrentUserNsec(null); setCurrentUserNpub(null); setNip46SignerPubkey(null);
            setFollowedTagsState(DEFAULT_FOLLOWED_TAGS);
            setFetchImagesByTagEnabledState(DEFAULT_FETCH_IMAGES_BY_TAG);
            setFetchVideosByTagEnabledState(DEFAULT_FETCH_VIDEOS_BY_TAG); // <<< Reset video pref on fail
            setFetchPodcastsByTagEnabledState(DEFAULT_FETCH_PODCASTS_BY_TAG); // <<< Reset podcast pref on fail
            setDefaultTipAmountState(DEFAULT_TIP_AMOUNT_SATS); // <<< Reset tip pref on fail
            setIsLoadingAuth(false); return false;
        }
    }, [saveNsecInternal]);

    // --- NIP-46 Persistence ---
    const cleanupNip46Attempt = useCallback(() => {
        if (nip46SubscriptionRef.current) {
            try { nip46SubscriptionRef.current.stop(); } catch (e) { /* ignore */ }
            nip46SubscriptionRef.current = null;
        }
        if (nip46TimeoutRef.current) { clearTimeout(nip46TimeoutRef.current); nip46TimeoutRef.current = null; }
        setNip46ConnectUri(null); setIsGeneratingUri(false); nip46TempPrivKeyRef.current = null;
        // Also clear the temporary signer from NDK if it was set
        if (ndkInstance && ndkInstance.signer && nip46TempPrivKeyRef.current) { // Simplified check
            const tempPubkeyHex = getPublicKey(nip46TempPrivKeyRef.current);
            // Compare hex public keys directly
            if (ndkInstance.signer.pubkey === tempPubkeyHex) {
                console.log("useAuth: Clearing temporary NIP-46 signer from NDK.");
                ndkInstance.signer = undefined;
            }
        }
    }, [ndkInstance]); // <<< Update dependency

    const clearNip46FromDb = useCallback(async () => {
        cleanupNip46Attempt();
        await idb.clearNip46SignerPubkeyFromDb();
    }, [cleanupNip46Attempt]);

    const saveNip46SignerToDb = useCallback(async (remotePubkeyHex: string) => {
        try {
            await idb.saveNip46SignerPubkeyToDb(remotePubkeyHex);
            setCurrentUserNpub(nip19.npubEncode(remotePubkeyHex));
            setCurrentUserNsec(null); // Clear local nsec
            setNip46SignerPubkey(remotePubkeyHex);
            setAuthError(null);

            // Load/set ALL settings
            const tags = await loadFollowedTags();
            const imagePref = await loadFetchImagesByTag();
            const videoPref = await loadFetchVideosByTag();
            const podcastPref = await loadFetchPodcastsByTag(); // <<< Load podcast pref
            const tipPref = await loadDefaultTipAmount();
            setFollowedTagsState(tags || []);
            setFetchImagesByTagEnabledState(imagePref);
            setFetchVideosByTagEnabledState(videoPref);
            setFetchPodcastsByTagEnabledState(podcastPref); // <<< Set podcast pref state
            setDefaultTipAmountState(tipPref);
            console.log("NIP-46 signer saved and ALL settings loaded.");

            // Create the signer and set it on the NDK instance if available
            if (ndkInstance) {
                const nip46Signer = new NDKNip46Signer(ndkInstance, remotePubkeyHex, undefined);
                nip46Signer.on('authUrl', (url) => {
                    console.warn('NIP-46 Auth URL generated unexpectedly during load:', url);
                    // Perhaps show this URL to the user to re-authorize?
                });
                ndkInstance.signer = nip46Signer;
                console.log("NIP-46 signer re-established on NDK instance.");
            }
        } catch (error) {
            console.error("Failed to save NIP-46 signer:", error);
            setAuthError("Failed to save NIP-46 connection.");
            throw error; // Re-throw
        }
    }, [ndkInstance, loadFollowedTags, loadFetchImagesByTag, loadFetchVideosByTag, loadFetchPodcastsByTag, loadDefaultTipAmount]);

    const loadNip46SignerFromDb = useCallback(async () => {
        const loadedPubkey = await idb.loadNip46SignerPubkeyFromDb();
        if (loadedPubkey) {
            try {
                const npub = nip19.npubEncode(loadedPubkey);
                setCurrentUserNpub(npub);
                setCurrentUserNsec(null);
                setNip46SignerPubkey(loadedPubkey);

                // Load ALL settings
                const tags = await loadFollowedTags();
                const imagePref = await loadFetchImagesByTag();
                const videoPref = await loadFetchVideosByTag();
                const podcastPref = await loadFetchPodcastsByTag(); // <<< Load podcast pref
                const tipPref = await loadDefaultTipAmount();
                setFollowedTagsState(tags || []);
                setFetchImagesByTagEnabledState(imagePref);
                setFetchVideosByTagEnabledState(videoPref);
                setFetchPodcastsByTagEnabledState(podcastPref); // <<< Set podcast pref state
                setDefaultTipAmountState(tipPref);
                console.log("Loaded NIP-46 signer and ALL settings:", npub);

                // Create the signer and set it on the NDK instance if available
                if (ndkInstance) {
                    const nip46Signer = new NDKNip46Signer(ndkInstance, loadedPubkey, undefined);
                    nip46Signer.on('authUrl', (url) => {
                        console.warn('NIP-46 Auth URL generated unexpectedly during load:', url);
                        // Perhaps show this URL to the user to re-authorize?
                    });
                    ndkInstance.signer = nip46Signer;
                    console.log("NIP-46 signer re-established on NDK instance.");
                }

                return loadedPubkey;
            } catch (error) {
                console.error("Error processing loaded NIP-46 pubkey:", error);
                await clearNip46FromDb(); // Clear invalid data
            }
        }
        return null;
    }, [ndkInstance, loadFollowedTags, loadFetchImagesByTag, loadFetchVideosByTag, loadFetchPodcastsByTag, loadDefaultTipAmount, clearNip46FromDb]); // Dependencies

    // --- Generate New Keys ---
    const generateNewKeys = useCallback(async (): Promise<{ npub: string; nsec: string } | null> => {
        console.log("Generating new keys..."); setAuthError(null);
        try {
            const skBytes = generateSecretKey(); const pkHex = getPublicKey(skBytes);
            const npub = nip19.npubEncode(pkHex); const nsec = nip19.nsecEncode(skBytes);
            return { npub, nsec };
        } catch (error) { console.error("Key generation failed:", error); setAuthError("Failed to generate keys."); return null; }
    }, []);

    // --- Initiate NIP-46 Connection ---
    const initiateNip46Connection = useCallback(async (): Promise<void> => {
        // <<< Check ndkInstance and isNdkReady >>>
        if (!ndkInstance || !isNdkReady) {
            setAuthError("NDK not ready.");
            setIsGeneratingUri(false);
            return;
        }

        console.log("Initiating NIP-46 connection...");
        setIsGeneratingUri(true); setAuthError(null); cleanupNip46Attempt(); // Clean previous attempts

        try {
            // Generate a temporary key pair for this connection attempt
            nip46TempPrivKeyRef.current = generateSecretKey();
            const tempPubkeyHex = getPublicKey(nip46TempPrivKeyRef.current);

            // Select *only one* reliable relay for the hint
            const theRelayHint = 'wss://relay.nsec.app'; // Use the corrected nsec.app relay

            // Ensure this relay is actually in the main list for consistency (optional check)
            if (!RELAYS.includes(theRelayHint)) {
                console.warn(`NIP-46 Hint Relay ${theRelayHint} not found in main RELAYS list.`);
                // Decide whether to proceed or throw error - proceeding for now
            }

            // Manually construct the URI with a single relay hint
            const relayParam = `relay=${encodeURIComponent(theRelayHint)}`;
            const metadataParam = `metadata=${encodeURIComponent(JSON.stringify({ name: "Madstr.tv TV App" }))}`;
            // Use nostrconnect:// scheme
            const connectUri = `nostrconnect://${tempPubkeyHex}?${relayParam}&${metadataParam}`;

            setNip46ConnectUri(connectUri);
            console.log("NIP-46 URI generated (manual, nostrconnect, single relay):", connectUri);

            // Corrected Filter: Listen for NIP-46 responses (kind 24133)
            // directed TO our temporary pubkey (#p tag)
            const filter: NDKFilter = {
                kinds: [24133],
                "#p": [tempPubkeyHex], // Corrected: Must target our temp pubkey
                since: Math.floor(Date.now() / 1000) - 60 // Look back briefly just in case
            };
            nip46SubscriptionRef.current = ndkInstance.subscribe(filter, { closeOnEose: false }); // Keep listening

            console.log("NIP-46 Subscription created for filter:", filter);

            nip46SubscriptionRef.current?.on("event", async (event: NDKEvent) => {
                console.log("NIP-46 Received potential response event:", event.id, "from", event.pubkey);
                if (!nip46TempPrivKeyRef.current) {
                     console.warn("NIP-46: Received event but temp key is missing.");
                     return; // Should not happen
                }
                try {
                    // Decrypt using the temporary private key and the sender's public key (Amber's pubkey)
                    const decryptedContent = await nip04.decrypt(nip46TempPrivKeyRef.current, event.pubkey, event.content);
                    const message = JSON.parse(decryptedContent);
                    console.log("NIP-46 Decrypted Response:", message);

                    // The key is that we received *any* valid decrypted message from the signer.
                    // The NIP-46 spec is loose on the *exact* confirmation response.
                    // Receiving a parsable encrypted message on this channel is sufficient confirmation.
                    console.log(`NIP-46: Signer ${event.pubkey} connected (received valid encrypted message).`);

                    // Save the REMOTE signer's pubkey (Amber's pubkey in this case)
                    await saveNip46SignerToDb(event.pubkey);
                    cleanupNip46Attempt(); // Success, clean up temp state/sub
                    setIsLoadingAuth(false); // Update loading state

                } catch (decryptError) {
                    // Ignore messages that fail decryption/parsing - they might not be intended for us.
                    console.warn("NIP-46 Decryption/Parse Error (might be expected noise):", decryptError);
                }
            });

            // Timeout for the connection attempt
            nip46TimeoutRef.current = setTimeout(() => {
                console.warn("NIP-46 connection timed out.");
                setAuthError("NIP-46 connection attempt timed out.");
                cleanupNip46Attempt();
                setIsLoadingAuth(false);
            }, NIP46_CONNECT_TIMEOUT);

        } catch (error) {
            console.error("NIP-46 URI Generation Error:", error);
            setAuthError(`Failed to initiate NIP-46: ${error instanceof Error ? error.message : String(error)}`);
            cleanupNip46Attempt(); // Clean up on error
            setIsLoadingAuth(false);
        }
    }, [ndkInstance, isNdkReady, cleanupNip46Attempt, saveNip46SignerToDb]);

    // --- Cancel NIP-46 Connection ---
    const cancelNip46Connection = useCallback(() => {
        console.log("Cancelling NIP-46 connection attempt.");
        setAuthError(null); // Clear any timeout error
        cleanupNip46Attempt();
    }, [cleanupNip46Attempt]);

    // --- Initialization Effect ---
    useEffect(() => {
        // <<< Check ndkInstance and isNdkReady >>>
        if (!ndkInstance || !isNdkReady) {
            console.log("useAuth: Waiting for NDK instance or readiness...");
            setIsLoadingAuth(true); // Keep loading true until NDK is ready
            return;
        }

        // <<< Use ndkInstance parameter >>>
        console.log("useAuth: NDK instance available and ready, initializing authentication...");
        const initializeAuth = async () => {
            try {
                // Try loading nsec first
                const nsec = await loadNsecFromDb();
                if (nsec) {
                    console.log("Auth initialized with local nsec.");
                    // Load ALL settings (tags, toggles, tip amount)
                    const tags = await loadFollowedTags();
                    const imagePref = await loadFetchImagesByTag();
                    const videoPref = await loadFetchVideosByTag();
                    const podcastPref = await loadFetchPodcastsByTag(); // <<< Load podcast pref
                    const tipPref = await loadDefaultTipAmount();
                    setFollowedTagsState(tags || []);
                    setFetchImagesByTagEnabledState(imagePref);
                    setFetchVideosByTagEnabledState(videoPref);
                    setFetchPodcastsByTagEnabledState(podcastPref); // <<< Set podcast pref state
                    setDefaultTipAmountState(tipPref);

                    // <<< Explicitly set nsec signer >>>
                    if (ndkInstance) {
                        try {
                            const decoded = nip19.decode(nsec);
                            if (decoded.type === 'nsec') {
                                ndkInstance.signer = new NDKPrivateKeySigner(decoded.data as Uint8Array);
                                console.log("Nsec signer explicitly set on NDK instance during init.");
                            }
                        } catch (e) { console.error("Failed to set nsec signer on NDK during init", e); }
                    }

                    setIsLoadingAuth(false);
                    return;
                }

                // If no nsec, try loading NIP-46 signer
                const nip46Pubkey = await loadNip46SignerFromDb();
                if (nip46Pubkey) {
                    console.log("Auth initialized with NIP-46 signer.");
                    // Load ALL settings
                    const tags = await loadFollowedTags();
                    const imagePref = await loadFetchImagesByTag();
                    const videoPref = await loadFetchVideosByTag();
                    const podcastPref = await loadFetchPodcastsByTag(); // <<< Load podcast pref
                    const tipPref = await loadDefaultTipAmount();
                    setFollowedTagsState(tags || []);
                    setFetchImagesByTagEnabledState(imagePref);
                    setFetchVideosByTagEnabledState(videoPref);
                    setFetchPodcastsByTagEnabledState(podcastPref); // <<< Set podcast pref state
                    setDefaultTipAmountState(tipPref);
                    setIsLoadingAuth(false);
                    return;
                }

                // No credentials found, set defaults
                console.log("No saved credentials found. Setting defaults.");
                setCurrentUserNpub(null);
                setCurrentUserNsec(null);
                setNip46SignerPubkey(null);
                const loadedTags = await loadFollowedTags();
                setFollowedTagsState(loadedTags || []);
                setFetchImagesByTagEnabledState(DEFAULT_FETCH_IMAGES_BY_TAG);
                setFetchVideosByTagEnabledState(DEFAULT_FETCH_VIDEOS_BY_TAG);
                setFetchPodcastsByTagEnabledState(DEFAULT_FETCH_PODCASTS_BY_TAG);
                setDefaultTipAmountState(DEFAULT_TIP_AMOUNT_SATS); // <<< Set default tip amount

            } catch (error: any) {
                console.error("Auth initialization error:", error);
                setAuthError("Failed to initialize authentication: " + error.message);
                // Reset state on error
                setCurrentUserNpub(null);
                setCurrentUserNsec(null);
                setNip46SignerPubkey(null);
                const loadedTags = await loadFollowedTags();
                setFollowedTagsState(loadedTags || []);
                setFetchImagesByTagEnabledState(DEFAULT_FETCH_IMAGES_BY_TAG);
                setFetchVideosByTagEnabledState(DEFAULT_FETCH_VIDEOS_BY_TAG);
                setFetchPodcastsByTagEnabledState(DEFAULT_FETCH_PODCASTS_BY_TAG);
                setDefaultTipAmountState(DEFAULT_TIP_AMOUNT_SATS); // <<< Reset tip amount on error
            }
            setIsLoadingAuth(false);
        };

        initializeAuth().catch(err => {
            console.error("Auth initialization failed:", err);
            setAuthError("Failed to initialize authentication.");
            setIsLoadingAuth(false);
        });

        // Cleanup function (optional, depending on needs)
        // return () => { console.log("Auth hook unmounting or NDK instance changed\"); };

    }, [ndkInstance, isNdkReady, loadNsecFromDb, loadNip46SignerFromDb, loadFollowedTags, loadFetchImagesByTag, loadFetchVideosByTag, loadFetchPodcastsByTag, loadDefaultTipAmount]); // <<< Added dependencies

    // --- Logout ---
    const logout = useCallback(async () => {
        console.log("Logging out...");
        setIsLoadingAuth(true);
        setAuthError(null);
        try {
            await clearNsecFromDb();
            await clearNip46FromDb();
            // Clear state
            setCurrentUserNpub(null);
            setCurrentUserNsec(null);
            setNip46SignerPubkey(null);
            cleanupNip46Attempt(); // Ensure any pending NIP-46 is stopped
            // Reset settings to defaults
            setFollowedTagsState([]);
            setFetchImagesByTagEnabledState(DEFAULT_FETCH_IMAGES_BY_TAG);
            setFetchVideosByTagEnabledState(DEFAULT_FETCH_VIDEOS_BY_TAG);
            setFetchPodcastsByTagEnabledState(DEFAULT_FETCH_PODCASTS_BY_TAG);
            setDefaultTipAmountState(DEFAULT_TIP_AMOUNT_SATS); // <<< Reset tip amount on logout
            await idb.clearFollowedTagsFromDb(); // Explicitly clear persisted settings
            await idb.clearFetchImagesByTagEnabledFromDb();
            await idb.clearFetchVideosByTagEnabledFromDb();
            await idb.clearFetchPodcastsByTagEnabledFromDb();
            await idb.clearDefaultTipAmountFromDb(); // <<< Clear persisted tip amount
            // <<< Clear the last checked DM timestamp >>>
            await idb.clearLastCheckedDmTimestamp();

            console.log("Logout successful, credentials and settings cleared.");
        } catch (error: any) {
            console.error("Logout failed:", error);
            setAuthError("Logout failed: " + error.message);
            // Attempt to reset state even on error
            setCurrentUserNpub(null);
            setCurrentUserNsec(null);
            setNip46SignerPubkey(null);
            const loadedTags = await loadFollowedTags();
            setFollowedTagsState(loadedTags || []);
            setFetchImagesByTagEnabledState(DEFAULT_FETCH_IMAGES_BY_TAG);
            setFetchVideosByTagEnabledState(DEFAULT_FETCH_VIDEOS_BY_TAG);
            setFetchPodcastsByTagEnabledState(DEFAULT_FETCH_PODCASTS_BY_TAG);
            setDefaultTipAmountState(DEFAULT_TIP_AMOUNT_SATS); // <<< Reset tip amount
        } finally {
            setIsLoadingAuth(false);
        }
    }, [clearNsecFromDb, clearNip46FromDb, cleanupNip46Attempt]);

    // --- Signer Logic ---
    const getNdkSigner = useCallback((): NDKPrivateKeySigner | NDKNip46Signer | undefined => {
        // Return NDK's current signer directly
        // <<< Use ndkInstance parameter >>>
        return ndkInstance?.signer as NDKPrivateKeySigner | NDKNip46Signer | undefined;
        // <<< Use ndkInstance parameter >>>
    }, [ndkInstance]); // <<< Update dependency

    // --- Unified Signing Method ---
    const signEvent = useCallback(async (event: NostrEvent): Promise<NostrEvent | null> => {
        const signer = getNdkSigner();
        if (!signer) {
            console.error("No signer available for signing.");
            setAuthError("Not logged in or signer unavailable.");
            return null;
        }
        try {
            // <<< Use ndkInstance parameter >>>
            const ndkEvent = new NDKEvent(ndkInstance, event); // <<< Use ndkInstance if available
            await ndkEvent.sign(signer);
            return ndkEvent.rawEvent();
        } catch (error) {
            console.error("Failed to sign event:", error);
            setAuthError(`Failed to sign event: ${error instanceof Error ? error.message : String(error)}`);
            return null;
        }
        // <<< Use ndkInstance parameter >>>
    }, [getNdkSigner, ndkInstance]); // <<< Update dependency

    // --- NIP-46 Encryption/Decryption ---
    const encryptDm = useCallback(async (recipientPubkeyHex: string, plaintext: string): Promise<string> => {
        const signer = getNdkSigner();
        if (!signer || !signer.user) {
             throw new Error("Cannot encrypt DM: Signer not available.");
        }
        // NDK signers should expose the secret key or implement nip04.encrypt
        // Assuming NDKPrivateKeySigner and NDKNip46Signer might have different ways
        if (signer instanceof NDKPrivateKeySigner && signer.privateKey) {
            return nip04.encrypt(signer.privateKey, recipientPubkeyHex, plaintext);
        } else if (signer instanceof NDKNip46Signer) {
            // NDKNip46Signer itself should handle the remote encryption via bunker
            // It needs an NDKUser object for the recipient
            // <<< Use ndkInstance parameter >>>
            if (!ndkInstance) throw new Error("NDK instance required for NIP-46 encryption");
            // <<< Use ndkInstance parameter >>>
            const recipientUser = ndkInstance.getUser({ hexpubkey: recipientPubkeyHex });
            return await signer.encrypt(recipientUser, plaintext);
        } else {
            throw new Error("Cannot encrypt DM: Unsupported signer type or missing private key.");
        }
        // <<< Use ndkInstance parameter >>>
    }, [getNdkSigner, ndkInstance]);

    // NIP-46 Decryption (using current signer)
    const decryptDm = useCallback(async (senderPubkeyHex: string, ciphertext: string): Promise<string> => {
        const signer = getNdkSigner();
        if (!signer) {
            throw new Error("Signer not available for decryption.");
        }

        // Handle NIP-46 Signer specifically
        if (signer instanceof NDKNip46Signer) {
            console.log("%%% useAuth: Using NIP-46 signer for decryption...");
            // <<< Use ndkInstance parameter >>>
            if (!ndkInstance) throw new Error("NDK instance required for NIP-46 decryption");
            // <<< Use ndkInstance parameter >>>
            const senderUser = ndkInstance.getUser({ hexpubkey: senderPubkeyHex });
            // NIP-46 signer requires the *other* user object
            return signer.decrypt(senderUser, ciphertext);
        } 
        // Handle Local Nsec Signer using nostr-tools nip04
        else if (signer instanceof NDKPrivateKeySigner && currentUserNsec) { 
            console.log("%%% useAuth: Using local nsec signer for decryption...");
            try {
                const decodedNsec = nip19.decode(currentUserNsec);
                if (decodedNsec.type === 'nsec') {
                    // Use nostr-tools nip04 directly
                    const plaintext = await nip04.decrypt(decodedNsec.data as Uint8Array, senderPubkeyHex, ciphertext);
                    return plaintext;
                } else {
                    throw new Error("Stored key is not a valid nsec.");
                }
            } catch (error) {
                console.error("NIP-04 Decryption failed:", error);
                throw new Error(`Failed to decrypt message: ${error instanceof Error ? error.message : String(error)}`);
            }
        } 
        // Fallback / Error
        else {
            throw new Error("Cannot decrypt DM: Unsupported signer type or missing private key.");
        }
        // <<< Use ndkInstance parameter >>>
    }, [getNdkSigner, currentUserNsec, ndkInstance]); // <<< Update dependency

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
        saveNsecToDb: saveNsecInternal, // Expose the internal save function
        getNdkSigner,
        signEvent,
        followedTags: memoizedFollowedTags,
        setFollowedTags,
        fetchImagesByTagEnabled,
        setFetchImagesByTagEnabled,
        fetchVideosByTagEnabled,
        setFetchVideosByTagEnabled,
        fetchPodcastsByTagEnabled,
        setFetchPodcastsByTagEnabled,
        defaultTipAmount,
        setDefaultTipAmount,
        encryptDm,
        decryptDm,
    };
};

// Helper function (consider moving to idb utils if used elsewhere)
// This might be needed if NDKNip46Signer requires the temp secret key
// However, NDK might manage this internally based on the connection URI logic
// declare global { interface Window { nip46?: { signerSecret: string | null } } } // Example, adjust as needed

/* <<< REMOVED unused function >>>
const loadNip46SignerSecret = (): string | null => {
    // This is tricky. How was the temp secret persisted during connection?
    // If stored in memory (nip46TempPrivKeyRef), it's lost on reload.
    // If saved to IDB (which it currently isn't), load it here.
    // NDK's NDKNip46Signer might handle this if initialized correctly.
    console.warn("loadNip46SignerSecret: Persistence of temp secret not implemented.");
    // Placeholder: return window.nip46?.signerSecret || null;
    return null;
};
*/ 