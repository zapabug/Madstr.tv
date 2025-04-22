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
const DEFAULT_FETCH_IMAGES_BY_TAG = true; // <<< New default
const DEFAULT_FETCH_VIDEOS_BY_TAG = true; // <<< New default for videos

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
            const videoPref = await loadFetchVideosByTag(); // <<< Load video pref
            setFollowedTagsState(Array.from(new Set([...DEFAULT_FOLLOWED_TAGS, ...tags])));
            setFetchImagesByTagEnabledState(imagePref);
            setFetchVideosByTagEnabledState(videoPref); // <<< Set video pref state
            console.log("Nsec saved and ALL settings loaded.");
        } catch (error) {
            console.error("Failed to save nsec:", error);
            setAuthError("Failed to save login credentials.");
            throw error; // Re-throw
        }
    }, [loadFollowedTags, loadFetchImagesByTag, loadFetchVideosByTag]); // Dependencies

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
    }, []);

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
            const videoPref = await loadFetchVideosByTag(); // <<< Load video pref
            setFollowedTagsState(Array.from(new Set([...DEFAULT_FOLLOWED_TAGS, ...tags])));
            setFetchImagesByTagEnabledState(imagePref);
            setFetchVideosByTagEnabledState(videoPref); // <<< Set video pref state
            console.log("NIP-46 signer saved and ALL settings loaded.");
        } catch (error) {
            console.error("Failed to save NIP-46 signer:", error);
            setAuthError("Failed to save NIP-46 connection.");
            throw error; // Re-throw
        }
    }, [loadFollowedTags, loadFetchImagesByTag, loadFetchVideosByTag]);

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
                const videoPref = await loadFetchVideosByTag(); // <<< Load video pref
                setFollowedTagsState(Array.from(new Set([...DEFAULT_FOLLOWED_TAGS, ...tags])));
                setFetchImagesByTagEnabledState(imagePref);
                setFetchVideosByTagEnabledState(videoPref); // <<< Set video pref state
                console.log("Loaded NIP-46 signer and ALL settings:", npub);
                return loadedPubkey;
            } catch (error) {
                console.error("Error processing loaded NIP-46 pubkey:", error);
                await clearNip46FromDb(); // Clear invalid data
            }
        }
        return null;
    }, [loadFollowedTags, loadFetchImagesByTag, loadFetchVideosByTag, clearNip46FromDb]); // Dependencies

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
        if (!ndkInstance) { setAuthError("NDK not ready."); return; }
        console.log("Initiating NIP-46 connection...");
        setIsGeneratingUri(true); setAuthError(null); cleanupNip46Attempt();
        try {
            const localSecret = generateSecretKey(); nip46TempPrivKeyRef.current = localSecret;
            const localPubkey = getPublicKey(localSecret);
            const uri = `nostrconnect://${localPubkey}?relay=${encodeURIComponent(NIP46_RELAYS[0])}&metadata=${encodeURIComponent(JSON.stringify({ name: "Madstr.tv App" }))}`;
            setNip46ConnectUri(uri);
            const filter: NDKFilter = { kinds: [24133], '#p': [localPubkey], since: Math.floor(Date.now() / 1000) - 10 };
            const sub = ndkInstance.subscribe(filter, { closeOnEose: false });
            nip46SubscriptionRef.current = sub;
            sub.on('event', async (event: NDKEvent) => {
                try {
                    const plaintext = await nip04.decrypt(localSecret, event.pubkey, event.content);
                    const response = JSON.parse(plaintext);
                    if (response.result === 'ack' || response.method === 'connect') { // Simplified check
                        console.log("NIP-46 connection confirmed by:", event.pubkey);
                        await saveNip46SignerToDb(event.pubkey); // Save successful connection
                        cleanupNip46Attempt(); // Clean up temp state
                        setIsLoadingAuth(false); // Auth is now complete
                    }
                } catch (e) { console.warn("Failed to decrypt/parse NIP-46 response:", e); }
            });
            nip46TimeoutRef.current = setTimeout(() => {
                console.warn("NIP-46 connection timed out.");
                setAuthError("Connection timed out.");
                cleanupNip46Attempt();
            }, NIP46_CONNECT_TIMEOUT);
        } catch (error) { console.error("Error initiating NIP-46:", error); setAuthError("Failed to start connection."); cleanupNip46Attempt(); }
    }, [ndkInstance, cleanupNip46Attempt, saveNip46SignerToDb]); // Dependencies

    const cancelNip46Connection = useCallback(() => {
        console.log("Cancelling NIP-46 attempt.");
        cleanupNip46Attempt();
        setAuthError("Connection cancelled.");
    }, [cleanupNip46Attempt]);

    // --- Logout ---
    const logout = useCallback(async () => {
        console.log("Logging out...");
        setCurrentUserNsec(null); setCurrentUserNpub(null); setNip46SignerPubkey(null);
        await clearNsecFromDb();
        await clearNip46FromDb(); // Also calls cleanup
        setFollowedTagsState(DEFAULT_FOLLOWED_TAGS);
        setFetchImagesByTagEnabledState(DEFAULT_FETCH_IMAGES_BY_TAG);
        setFetchVideosByTagEnabledState(DEFAULT_FETCH_VIDEOS_BY_TAG); // <<< Reset video toggle
        setAuthError(null); setIsLoadingAuth(false);
        console.log("Logout complete.");
    }, [clearNsecFromDb, clearNip46FromDb]); // Dependencies

    // --- Initialization Effect ---
    useEffect(() => {
        const initializeAuth = async () => {
            setIsLoadingAuth(true); setAuthError(null);
            try {
                const nsec = await loadNsecFromDb();
                if (nsec) { // Nsec loaded, load settings
                    const tags = await loadFollowedTags();
                    const imagePref = await loadFetchImagesByTag();
                    const videoPref = await loadFetchVideosByTag(); // <<< Load video pref
                    setFollowedTagsState(Array.from(new Set([...DEFAULT_FOLLOWED_TAGS, ...tags])));
                    setFetchImagesByTagEnabledState(imagePref);
                    setFetchVideosByTagEnabledState(videoPref); // <<< Set video pref
                } else {
                    const nip46pk = await loadNip46SignerFromDb();
                    if (!nip46pk) { // Neither loaded, load defaults/stored settings
                        const tags = await loadFollowedTags();
                        const imagePref = await loadFetchImagesByTag();
                        const videoPref = await loadFetchVideosByTag(); // <<< Load video pref
                        setFollowedTagsState(Array.from(new Set([...DEFAULT_FOLLOWED_TAGS, ...tags])));
                        setFetchImagesByTagEnabledState(imagePref);
                        setFetchVideosByTagEnabledState(videoPref); // <<< Set video pref
                    }
                }
            } catch (error) { console.error("Auth init error:", error); setAuthError("Failed to init auth."); }
             finally { setIsLoadingAuth(false); }
        };
        initializeAuth();
    }, [loadNsecFromDb, loadNip46SignerFromDb, loadFollowedTags, loadFetchImagesByTag, loadFetchVideosByTag]); // Correct dependencies

    // --- NDK Signer Logic ---
    const getNdkSigner = useCallback((): NDKPrivateKeySigner | NDKNip46Signer | undefined => {
        if (!ndkInstance) return undefined;
        if (currentUserNsec) {
            try {
                const decoded = nip19.decode(currentUserNsec);
                if (decoded.type === 'nsec') return new NDKPrivateKeySigner(decoded.data as Uint8Array);
            } catch (e) { console.error("Failed to create nsec signer", e); }
        } else if (nip46SignerPubkey) {
            try {
                return new NDKNip46Signer(ndkInstance, nip46SignerPubkey);
            } catch (e) { console.error("Failed to create NIP46 signer", e); }
        }
        return undefined;
    }, [ndkInstance, currentUserNsec, nip46SignerPubkey]);

    // --- Unified Signing Method ---
    const signEvent = useCallback(async (event: NostrEvent): Promise<NostrEvent | null> => {
        const signer = getNdkSigner();
        if (!signer || !ndkInstance) { setAuthError("Signer/NDK unavailable."); return null; }
        try {
            const ndkEvent = new NDKEvent(ndkInstance, event); await ndkEvent.sign(signer);
            return ndkEvent.rawEvent();
        } catch (error) { console.error("Sign event failed:", error); setAuthError("Failed to sign."); return null; }
    }, [getNdkSigner, ndkInstance]);

    // --- NIP-04 Encrypt/Decrypt ---
    const encryptDm = useCallback(async (recipientPubkeyHex: string, plaintext: string): Promise<string> => {
        const signer = getNdkSigner();
        if (!signer || !ndkInstance) throw new Error("Signer/NDK unavailable.");
        try {
            if (signer instanceof NDKPrivateKeySigner) {
                const pkBytes = (signer as any)._privateKey; if (!pkBytes) throw new Error("No private key");
                // @ts-ignore - works with Uint8Array
                return nip04.encrypt(pkBytes, recipientPubkeyHex, plaintext);
            } else if (signer instanceof NDKNip46Signer) {
                const recipientUser = ndkInstance.getUser({ pubkey: recipientPubkeyHex });
                return await signer.encrypt(recipientUser, plaintext);
            } else throw new Error("Unsupported signer");
        } catch (e) { console.error("Encrypt failed:", e); throw new Error("Encryption failed."); }
    }, [getNdkSigner, ndkInstance]);

    const decryptDm = useCallback(async (senderPubkeyHex: string, ciphertext: string): Promise<string> => {
        const signer = getNdkSigner();
        if (!signer || !ndkInstance) throw new Error("Signer/NDK unavailable.");
        try {
            if (signer instanceof NDKPrivateKeySigner) {
                const pkBytes = (signer as any)._privateKey; if (!pkBytes) throw new Error("No private key");
                // @ts-ignore - works with Uint8Array
                return nip04.decrypt(pkBytes, senderPubkeyHex, ciphertext);
            } else if (signer instanceof NDKNip46Signer) {
                const senderUser = ndkInstance.getUser({ pubkey: senderPubkeyHex });
                return await signer.decrypt(senderUser, ciphertext);
            } else throw new Error("Unsupported signer");
        } catch (e) { console.error("Decrypt failed:", e); throw new Error("Decryption failed."); }
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
        saveNsecToDb: saveNsecInternal,
        getNdkSigner,
        signEvent,
        // Hashtag state and setter
        followedTags: memoizedFollowedTags,
        setFollowedTags,
        // Image Fetch Toggle <<< Return new state and setter >>>
        fetchImagesByTagEnabled,
        setFetchImagesByTagEnabled,
        // <<< Return video toggle state and setter >>>
        fetchVideosByTagEnabled,
        setFetchVideosByTagEnabled,
        // NIP-04
        encryptDm,
        decryptDm,
    }; 
} 