import { useState, useEffect, useCallback, useRef } from 'react';
import * as nip19 from 'nostr-tools/nip19';
import { encrypt, decrypt, getConversationKey } from 'nostr-tools/nip44';
import { getPublicKey, generateSecretKey } from 'nostr-tools/pure';
import NDK, { NDKPrivateKeySigner, NDKNip46Signer, NDKEvent, NostrEvent, NDKUser, NDKSubscription } from '@nostr-dev-kit/ndk';
import { idb, StoredNsecData, StoredImageFiltering, StoredVideoFiltering, StoredMusicFiltering, StoredNip46Session } from '../utils/idb';

interface NostrWindow {
    nostr?: {
        getPublicKey(): Promise<string>;
        signEvent(_event: unknown): Promise<unknown>;
        getRelays?(): Promise<Record<string, { read: boolean; write: boolean }>>;
    };
}

interface Nip46User {
    npub: string;
    pubkey: string;
}

declare global {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface Window extends NostrWindow {}
}

// NIP-44 helper functions
const nip44Encrypt = (sk: Uint8Array, pk: string, data: string): string => {
    const key = getConversationKey(sk, pk);
    return encrypt(data, key);
};

const nip44Decrypt = (sk: Uint8Array, pk: string, ciphertext: string): string => {
    const key = getConversationKey(sk, pk);
    return decrypt(ciphertext, key);
};

// Define default tags (can be customized)
const DEFAULT_FOLLOWED_TAGS = ['memes', 'landscape', 'photography', 'art', 'music', 'podcast', 'nosolutions'];

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
    hasExtension: boolean; // NIP-07 extension detected
    initiateNip46Connection: () => Promise<void>; // QR code flow - generate URI and wait
    connectWithBunkerUri: (_bunkerUri: string) => Promise<void>; // Paste flow - parse URI and connect
    connectWithExtension: () => Promise<void>; // NIP-07 extension flow
    cancelNip46Connection: () => void; // Function to cancel NIP-46 attempt
    generateNewKeys: () => Promise<{ npub: string; nsec: string } | null>;
    loginWithNsec: (_nsec: string) => Promise<boolean>;
    logout: () => Promise<void>;
    saveNsecToDb: (_nsec: string) => Promise<void>; // Explicit save function
    getNdkSigner: () => Promise<NDKPrivateKeySigner | NDKNip46Signer | undefined>; // To get the current signer for NDK
    signEvent: (_event: NostrEvent) => Promise<NostrEvent | null>; // Unified signing method
    // Hashtag state and setter
    followedTags: string[];
    setFollowedTags: (_tags: string[]) => void;
    // Video hashtag state and setter (separate from image/audio tags)
    videoTags: string[];
    setVideoTags: (_tags: string[]) => void;
    // Music hashtag state and setter
    musicTags: string[];
    setMusicTags: (_tags: string[]) => void;
    // NIP-04 Methods (deprecated, for fallback)
    encryptDm: (_recipientPubkeyHex: string, _plaintext: string) => Promise<string>;
    decryptDm: (_senderPubkeyHex: string, _ciphertext: string) => Promise<string>;
    // Tag filtering flags
    fetchImagesByTagEnabled: boolean;
    fetchVideosByTagEnabled: boolean;
    fetchMusicByTagEnabled: boolean;
    keywordSearch: string;
    setKeywordSearch: (_keyword: string) => void;
    setFetchImagesByTagEnabled: (_enabled: boolean) => void;
    setFetchVideosByTagEnabled: (_enabled: boolean) => void;
    setFetchMusicByTagEnabled: (_enabled: boolean) => void;
    // Mute list (Kind 10000)
    mutedPubkeys: string[];
    ndk: NDK | undefined;
}


// const APP_IDENTITY_NPUB = "npub1..."; // Use NDK's signer pubkey if available, or generate one
// const APP_IDENTITY_NSEC = "nsec1..."; // TODO: Ideally load from secure config, not hardcoded (Commented out as unused)

const NIP46_RELAYS = ['wss://nsec.app', 'wss://relay.damus.io', 'wss://relay.primal.net'];

// Remove NDK instance argument from the hook definition
export const useAuth = (): UseAuthReturn => {
    // Get NDK instance via hook
    const { ndk } = useNDK();

    // --- State ---
    const [currentUserNpub, setCurrentUserNpub] = useState<string | null>(null);
    const [currentUserNsec, setCurrentUserNsec] = useState<string | null>(null);
    const [nip46SessionPayload, setNip46SessionPayload] = useState<string | null>(null);
    const [isLoadingAuth, setIsLoadingAuth] = useState<boolean>(true);
    const [authError, setAuthError] = useState<string | null>(null);
    const [nip46ConnectUri, setNip46ConnectUri] = useState<string | null>(null);
    const [isGeneratingUri, setIsGeneratingUri] = useState<boolean>(false);
    const hasExtension = !!(typeof window !== 'undefined' && window.nostr);
    const [isExtensionSession, setIsExtensionSession] = useState<boolean>(false);
    const [followedTags, setFollowedTagsState] = useState<string[]>(DEFAULT_FOLLOWED_TAGS);
    const [videoTags, setVideoTagsState] = useState<string[]>(DEFAULT_FOLLOWED_TAGS);
    const [musicTags, setMusicTagsState] = useState<string[]>(DEFAULT_FOLLOWED_TAGS);
    const [fetchImagesByTagEnabled, setFetchImagesByTagEnabledState] = useState<boolean>(false);
    const [fetchVideosByTagEnabled, setFetchVideosByTagEnabledState] = useState<boolean>(false);
    const [fetchMusicByTagEnabled, setFetchMusicByTagEnabledState] = useState<boolean>(false);
    const [keywordSearch, setKeywordSearchState] = useState<string>('');
    const [mutedPubkeys, setMutedPubkeys] = useState<string[]>([]);

    // Derived state for isLoggedIn based on nsec, nip46 session, or extension session
    const isLoggedIn = !!(currentUserNpub && (currentUserNsec || nip46SessionPayload || isExtensionSession));

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

     const setFollowedTags = useCallback((tags: string[]) => {
         setFollowedTagsState(tags);
         saveFollowedTags(tags);
     }, [saveFollowedTags]);

     // --- Video Tags Persistence ---
     const loadVideoTags = useCallback(async () => {
         try {
             const storedTags = await idb.getSetting('videoTags') as string[] | undefined;
             if (storedTags && Array.isArray(storedTags)) {
                 console.log("Loaded video tags from DB:", storedTags);
                 return storedTags;
             }
         } catch (error) {
             console.error("Failed to load video tags from IndexedDB:", error);
         }
         return DEFAULT_FOLLOWED_TAGS;
     }, []);

     const saveVideoTags = useCallback(async (tags: string[]) => {
         try {
             if (!Array.isArray(tags)) throw new Error("Invalid tags format: not an array.");
             const validTags = tags.filter(tag => typeof tag === 'string' && tag.trim().length > 0 && tag.length < 50);
             await idb.putSetting({ id: 'videoTags', tags: validTags });
             console.log("Saved video tags to DB:", validTags);
         } catch (error) {
             console.error("Failed to save video tags to IndexedDB:", error);
         }
     }, []);

     const setVideoTags = useCallback((tags: string[]) => {
         setVideoTagsState(tags);
         saveVideoTags(tags);
     }, [saveVideoTags]);

     // --- Music Tags ---
     const loadMusicTags = useCallback(async () => {
         try {
             const storedTags = await idb.getSetting('musicTags') as string[] | undefined;
             if (storedTags && Array.isArray(storedTags)) {
                 console.log("Loaded music tags from DB:", storedTags);
                 return storedTags;
             }
         } catch (error) {
             console.error("Failed to load music tags from IndexedDB:", error);
         }
         return DEFAULT_FOLLOWED_TAGS;
     }, []);

     const saveMusicTags = useCallback(async (tags: string[]) => {
         try {
             if (!Array.isArray(tags)) throw new Error("Invalid tags format: not an array.");
             const validTags = tags.filter(tag => typeof tag === 'string' && tag.trim().length > 0 && tag.length < 50);
             await idb.putSetting({ id: 'musicTags', tags: validTags });
             console.log("Saved music tags to DB:", validTags);
         } catch (error) {
             console.error("Failed to save music tags to IndexedDB:", error);
         }
     }, []);

     const setMusicTags = useCallback((tags: string[]) => {
         setMusicTagsState(tags);
         saveMusicTags(tags);
     }, [saveMusicTags]);

    // --- Hashtag Filtering State ---
    const loadFilteringState = useCallback(async () => {
        try {
            const storedImageFiltering = await idb.getSetting('fetchImagesByTagEnabled') as StoredImageFiltering | undefined;
            const storedVideoFiltering = await idb.getSetting('fetchVideosByTagEnabled') as StoredVideoFiltering | undefined;
            const storedMusicFiltering = await idb.getSetting('fetchMusicByTagEnabled') as StoredMusicFiltering | undefined;
            
            if (storedImageFiltering?.value !== undefined) {
                setFetchImagesByTagEnabledState(storedImageFiltering.value);
            }
            if (storedVideoFiltering?.value !== undefined) {
                setFetchVideosByTagEnabledState(storedVideoFiltering.value);
            }
            if (storedMusicFiltering?.value !== undefined) {
                setFetchMusicByTagEnabledState(storedMusicFiltering.value);
            }
        } catch (error) {
            console.error("Failed to load hashtag filtering state from IndexedDB:", error);
        }
    }, []);

    const saveFilteringState = useCallback(async (type: 'images' | 'videos' | 'music', enabled: boolean) => {
        try {
            // const settingId = type === 'images' ? 'fetchImagesByTagEnabled' : 'fetchVideosByTagEnabled'; // Unused
            const setting = type === 'images' 
                ? { id: 'fetchImagesByTagEnabled', value: enabled } as StoredImageFiltering
                : { id: 'fetchVideosByTagEnabled', value: enabled } as StoredVideoFiltering;
            await idb.putSetting(setting);
        } catch (error) {
            console.error(`Failed to save ${type} filtering state to IndexedDB:`, error);
        }
    }, []);

    const setFetchImagesByTagEnabled = useCallback((enabled: boolean) => {
        setFetchImagesByTagEnabledState(enabled);
        saveFilteringState('images', enabled);
    }, [saveFilteringState]);

    const setFetchVideosByTagEnabled = useCallback((enabled: boolean) => {
        setFetchVideosByTagEnabledState(enabled);
        saveFilteringState('videos', enabled);
    }, [saveFilteringState]);

    const setFetchMusicByTagEnabled = useCallback((enabled: boolean) => {
        setFetchMusicByTagEnabledState(enabled);
        saveFilteringState('music', enabled);
    }, [saveFilteringState]);

    const setKeywordSearch = useCallback((keyword: string) => {
        setKeywordSearchState(keyword);
    }, []);

    // Load filtering state on mount
    useEffect(() => {
        loadFilteringState();
    }, [loadFilteringState]);

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

            const skBytes = decoded.data as Uint8Array;
            // Pass Uint8Array to getPublicKey
            const pkHex = getPublicKey(skBytes);
            const npub = nip19.npubEncode(pkHex);
            setCurrentUserNsec(nsec);
            setCurrentUserNpub(npub);
            setNip46SessionPayload(null);
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
            const decoded = nip19.decode(nsecInput);
            if (decoded.type === 'nsec') {
                 await saveNsecToDb(nsecInput); // This now handles setting tags
                 setIsLoadingAuth(false);
                return true;
            } else {
                throw new Error("Invalid nsec format provided.");
            }
        } catch (error: unknown) {
            console.error("Login with nsec failed:", error);
            setAuthError(error instanceof Error ? error.message : "Invalid nsec provided.");
            setCurrentUserNsec(null);
            setCurrentUserNpub(null);
            setNip46SessionPayload(null);
            setFollowedTagsState(DEFAULT_FOLLOWED_TAGS); // Reset tags to default on failed login
            setIsLoadingAuth(false);
            return false;
        }
    }, [saveNsecToDb]);

    // --- NIP-46 Handling ---

    const saveNip46SessionToDb = useCallback(async (payload: string) => {
        try {
            await idb.putSetting({ id: 'nip46Session', payload });
            console.log("Saved NIP-46 session to DB");
        } catch (error) {
            console.error("Failed to save NIP-46 session:", error);
        }
    }, []);

    const loadNip46SessionFromDb = useCallback(async (): Promise<string | null> => {
        try {
            const stored = await idb.getSetting('nip46Session') as StoredNip46Session | undefined;
            if (stored?.payload) {
                console.log("Loaded NIP-46 session from DB");
                return stored.payload;
            }
        } catch (error) {
            console.error("Failed to load NIP-46 session:", error);
        }
        return null;
    }, []);

    const clearNip46SessionFromDb = useCallback(async () => {
        try {
            await idb.deleteSetting('nip46Session');
            console.log("Cleared NIP-46 session from DB");
        } catch (error) {
            console.error("Failed to clear NIP-46 session:", error);
        }
    }, []);

    const convertNostrconnectToBunker = (nostrconnectUri: string): string => {
        try {
            const url = new URL(nostrconnectUri);
            const pubkey = url.hostname;
            const relays = url.searchParams.getAll('relay');
            const secret = url.searchParams.get('secret');
            
            const bunkerUrl = new URL('bunker://' + pubkey);
            relays.forEach(relay => bunkerUrl.searchParams.append('relay', relay));
            if (secret) bunkerUrl.searchParams.set('secret', secret);
            
            return bunkerUrl.toString();
        } catch (error) {
            console.error("Failed to convert nostrconnect to bunker URI:", error);
            throw new Error("Invalid NIP-46 connection URI");
        }
    };

    const initiateNip46Connection = useCallback(async (): Promise<void> => {
        if (!ndkInstance) {
            setAuthError("NDK not initialized.");
            console.error("Cannot initiate NIP-46: NDK instance is missing.");
            return;
        }

        console.log("[bunker] Initiating NIP-46 connection (QR flow)...");
        setIsLoadingAuth(true);
        setIsGeneratingUri(true);
        setAuthError(null);

        let subscription: NDKSubscription | null = null;
        let timeoutId: NodeJS.Timeout | null = null;

        const cleanup = () => {
            if (subscription) {
                subscription.stop();
                subscription = null;
            }
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
        };

        try {
            const tempPrivKeyBytes = generateSecretKey();
            const tempPubKeyHex = getPublicKey(tempPrivKeyBytes);
            const localSigner = new NDKPrivateKeySigner(tempPrivKeyBytes);

            const uriParams = new URLSearchParams();
            NIP46_RELAYS.forEach(relay => uriParams.append('relay', relay));
            uriParams.append('metadata', JSON.stringify({ name: "Madstr.tv" }));
            const connectUri = `nostrconnect://${tempPubKeyHex}?${uriParams.toString()}`;
            setNip46ConnectUri(connectUri);
            setIsGeneratingUri(false);

            const bunkerUri = convertNostrconnectToBunker(connectUri);
            const { pubkey: bunkerPubkey } = parseBunkerUri(bunkerUri);
            console.log("[bunker] Generated bunker URI for QR code");
            console.log("[bunker] Bunker pubkey:", bunkerPubkey);

            const connectRequestId = Math.random().toString(36).substring(7);
            let getPkRequestId: string | null = null;
            const connectParams = [tempPubKeyHex];

            const filter = {
                kinds: [24133],
                '#p': [tempPubKeyHex],
                since: Math.floor(Date.now() / 1000) - 10,
            };

            console.log("[bunker] Subscribing to NIP-46 events...");
            subscription = ndkInstance.subscribe(filter, { 
                closeOnEose: false,
            });

            const user = await new Promise<Nip46User>((resolve, reject) => {
                timeoutId = setTimeout(() => {
                    cleanup();
                    reject(new Error("[bunker] Connection timed out"));
                }, 60000);

                subscription.on('event', async (event: NDKEvent) => {
                    try {
                        const decryptedContent = nip44Decrypt(tempPrivKeyBytes, event.pubkey, event.content);
                        const response = JSON.parse(decryptedContent);
                        console.log("[bunker] Received response:", JSON.stringify(response));

                        if (response.result === "ack") {
                            console.log("[bunker] Got ACK! Connection established.");
                            
                            getPkRequestId = Math.random().toString(36).substring(7);
                            const getPkRequest = { id: getPkRequestId, method: "get_public_key", params: [] };
                            const encryptedRequest = await nip44Encrypt(tempPrivKeyBytes, event.pubkey, JSON.stringify(getPkRequest));
                            
                            const requestEvent = new NDKEvent(ndkInstance);
                            requestEvent.kind = 24133;
                            requestEvent.created_at = Math.floor(Date.now() / 1000);
                            requestEvent.content = encryptedRequest;
                            requestEvent.tags = [['p', event.pubkey]];
                            requestEvent.pubkey = tempPubKeyHex;
                            
                            const requestSig = await localSigner.sign(requestEvent.rawEvent());
                            requestEvent.sig = requestSig;
                            requestEvent.id = requestEvent.getEventHash();
                            
                            console.log("[bunker] Sending get_public_key request (no secret)...");
                            console.log("[bunker] get_pk request id:", getPkRequestId);
                            await requestEvent.publish();
                        } else if (response.id === getPkRequestId && response.result) {
                            const pubkeyHex = response.result;
                            console.log("[bunker] Got public key:", pubkeyHex);
                            
                            if (pubkeyHex && pubkeyHex.length === 64 && /^[a-fA-F0-9]+$/.test(pubkeyHex)) {
                                cleanup();
                                const user = ndkInstance.getUser({ hexpubkey: pubkeyHex });
                                resolve(user);
                            } else {
                                console.error("[bunker] Invalid pubkey format:", pubkeyHex);
                            }
                        } else if (response.error) {
                            console.error("[bunker] Error:", JSON.stringify(response.error));
                            cleanup();
                            reject(new Error(response.error.message || response.error || 'Connection failed'));
                        }
                    } catch (error) {
                        console.error("[bunker] Failed to process event:", error);
                    }
                });

                subscription.start();

                setTimeout(async () => {
                    console.log("[bunker] Sending connect request...");
                    try {
                        const connectRequest = { id: connectRequestId, method: "connect", params: connectParams };
                        console.log("[bunker] Connect request ID:", connectRequestId);
                        const encryptedConnect = await nip44Encrypt(tempPrivKeyBytes, bunkerPubkey, JSON.stringify(connectRequest));
                        
                        const event = new NDKEvent(ndkInstance);
                        event.kind = 24133;
                        event.created_at = Math.floor(Date.now() / 1000);
                        event.content = encryptedConnect;
                        event.tags = [['p', bunkerPubkey]];
                        event.pubkey = tempPubKeyHex;
                        
                        const sig = await localSigner.sign(event.rawEvent());
                        event.sig = sig;
                        event.id = event.getEventHash();
                        
                        console.log("[bunker] Publishing connect event...");
                        await event.publish();
                    } catch (error) {
                        console.error("[bunker] Failed to send connect request:", error);
                        cleanup();
                        reject(error);
                    }
                }, 1000);
            });

            console.log("[bunker] Connection established! User:", user.npub);
            
            const localSignerPayload = (localSigner as NDKPrivateKeySigner & { privateKey: string }).privateKey;
            const payloadObj = {
                type: "nip46",
                payload: {
                    bunkerPubkey: bunkerPubkey,
                    userPubkey: user.pubkey,
                    relayUrls: NIP46_RELAYS,
                    secret: null,
                    localSignerPayload: localSignerPayload,
                    nip05: null,
                },
            };
            const payload = JSON.stringify(payloadObj);
            setNip46SessionPayload(payload);
            await saveNip46SessionToDb(payload);
            
            setCurrentUserNpub(user.npub);
            setCurrentUserNsec(null);
            setNip46ConnectUri(null);
            setAuthError(null);
            
            const userTags = await loadFollowedTags();
            const mergedTags = Array.from(new Set([...DEFAULT_FOLLOWED_TAGS, ...userTags]));
            setFollowedTagsState(mergedTags);
            
            setIsLoadingAuth(false);
            console.log("[bunker] NIP-46 login successful!");

        } catch (error: unknown) {
            console.error("[bunker] NIP-46 connection failed:", error);
            cleanup();
            const errorMessage = error instanceof Error ? error.message : 'Connection failed';
            setAuthError(`Bunker Connection Failed: ${errorMessage}`);
            setNip46ConnectUri(null);
            setIsLoadingAuth(false);
        }
    }, [ndkInstance, loadFollowedTags, saveNip46SessionToDb]);

    const parseBunkerUri = (uri: string): { pubkey: string; relays: string[]; secret?: string } => {
        try {
            const url = new URL(uri);
            const pubkey = url.hostname || url.pathname.replace(/^\/\//, "");
            const relays = url.searchParams.getAll('relay');
            const secret = url.searchParams.get('secret') || undefined;
            return { pubkey, relays, secret };
        } catch (error) {
            console.error("Failed to parse bunker URI:", error);
            throw new Error("Invalid bunker URI");
        }
    };

    const connectWithBunkerUri = useCallback(async (bunkerUri: string): Promise<void> => {
        if (!ndkInstance) {
            setAuthError("NDK not initialized.");
            console.error("Cannot connect with bunker: NDK instance is missing.");
            return;
        }

        console.log("[bunker] Connecting with bunker URI:", bunkerUri);
        setIsLoadingAuth(true);
        setAuthError(null);

        try {
            const signer = new NDKNip46Signer(ndkInstance, bunkerUri);
            
            signer.on('authUrl', (url: string) => {
                console.log("[bunker] Auth URL event:", url);
            });

            console.log("[bunker] Waiting for connection (blockUntilReady)...");
            const user = await signer.blockUntilReady();
            
            console.log("[bunker] NIP-46 connection established for user:", user.npub);
            
            const payload = signer.toPayload();
            setNip46SessionPayload(payload);
            await saveNip46SessionToDb(payload);
            
            setCurrentUserNpub(user.npub);
            setCurrentUserNsec(null);
            setNip46ConnectUri(null);
            setAuthError(null);
            
            const userTags = await loadFollowedTags();
            const mergedTags = Array.from(new Set([...DEFAULT_FOLLOWED_TAGS, ...userTags]));
            setFollowedTagsState(mergedTags);
            
            setIsLoadingAuth(false);
            console.log("[bunker] NIP-46 login successful!");

        } catch (error: unknown) {
            console.error("[bunker] NIP-46 connection failed:", error);
            const errorMessage = error instanceof Error ? error.message : 'Connection failed';
            setAuthError(`Bunker Connection Failed: ${errorMessage}`);
            setNip46ConnectUri(null);
            setIsLoadingAuth(false);
        }
    }, [ndkInstance, loadFollowedTags, saveNip46SessionToDb]);

    const restoreNip46Session = useCallback(async (): Promise<boolean> => {
        if (!ndkInstance) return false;
        
        try {
            const payload = await loadNip46SessionFromDb();
            if (!payload) return false;

            console.log("Restoring NIP-46 session...");
            const signer = await NDKNip46Signer.fromPayload(payload, ndkInstance);
            
            signer.on('authUrl', (url: string) => {
                console.log("NIP-46 auth URL received during restore:", url);
                if (url) {
                    window.open(url, 'auth', 'width=600,height=600');
                }
            });

            const user = await signer.blockUntilReady();
            
            setNip46SessionPayload(payload);
            setCurrentUserNpub(user.npub);
            setCurrentUserNsec(null);
            
            const userTags = await loadFollowedTags();
            const mergedTags = Array.from(new Set([...DEFAULT_FOLLOWED_TAGS, ...userTags]));
            setFollowedTagsState(mergedTags);
            
            console.log("NIP-46 session restored for user:", user.npub);
            return true;
        } catch (error) {
            console.error("Failed to restore NIP-46 session:", error);
            await clearNip46SessionFromDb();
            return false;
        }
    }, [ndkInstance, loadNip46SessionFromDb, loadFollowedTags, clearNip46SessionFromDb]);

    const connectWithExtension = useCallback(async (): Promise<void> => {
        if (typeof window === 'undefined' || !window.nostr) {
            setAuthError("No Nostr extension found.");
            return;
        }

        console.log("[extension] Connecting with NIP-07 extension...");
        setIsLoadingAuth(true);
        setAuthError(null);

        try {
            const pubkey = await window.nostr.getPublicKey();
            const npub = nip19.npubEncode(pubkey);
            
            setCurrentUserNpub(npub);
            setCurrentUserNsec(null);
            setNip46SessionPayload(null);
            setIsExtensionSession(true);
            setAuthError(null);
            
            const userTags = await loadFollowedTags();
            const mergedTags = Array.from(new Set([...DEFAULT_FOLLOWED_TAGS, ...userTags]));
            setFollowedTagsState(mergedTags);
            
            setIsLoadingAuth(false);
            console.log("[extension] Logged in with extension:", npub);

        } catch (error: unknown) {
            console.error("[extension] Connection failed:", error);
            const errorMessage = error instanceof Error ? error.message : 'Connection failed';
            setAuthError(`Extension Error: ${errorMessage}`);
            setIsLoadingAuth(false);
        }
    }, [loadFollowedTags]);

    const cancelNip46Connection = useCallback(() => {
        console.log("User cancelled NIP-46 connection attempt.");
        setAuthError("Connection cancelled.");
        setNip46ConnectUri(null);
        setIsLoadingAuth(false);
    }, []);

    // --- General Auth Logic ---

    const logout = useCallback(async () => {
        console.log("Logging out...");
        setIsLoadingAuth(true);
        setAuthError(null);
        setCurrentUserNpub(null);
        setCurrentUserNsec(null);
        setNip46SessionPayload(null);
        setNip46ConnectUri(null);
        setIsExtensionSession(false);
        await clearNsecFromDb();
        await clearNip46SessionFromDb();
        setFollowedTagsState(DEFAULT_FOLLOWED_TAGS);
        setIsLoadingAuth(false);
        console.log("Logout complete.");
    }, [clearNsecFromDb, clearNip46SessionFromDb]);

    // --- Initialization Effect ---
    useEffect(() => {
        const initializeAuth = async () => {
            console.log("Initializing auth...");
            setIsLoadingAuth(true);
            setAuthError(null);

            const loadedNsec = await loadNsecFromDb();
            const loadedTags = await loadFollowedTags();

            if (loadedNsec) {
                const mergedTags = Array.from(new Set([...DEFAULT_FOLLOWED_TAGS, ...loadedTags]));
                setFollowedTagsState(mergedTags);
                console.log("Auth initialized with stored nsec.");
            } else {
                // Check for NIP-46 session first
                const sessionRestored = await restoreNip46Session();
                if (sessionRestored) {
                    console.log("Auth initialized with restored NIP-46 session.");
                } else {
                    // Check for extension session
                    if (typeof window !== 'undefined' && window.nostr) {
                        try {
                            console.log("[extension] Checking for extension session on init...");
                            const pubkey = await window.nostr.getPublicKey();
                            const npub = nip19.npubEncode(pubkey);
                            setCurrentUserNpub(npub);
                            setCurrentUserNsec(null);
                            setNip46SessionPayload(null);
                            setIsExtensionSession(true);
                            const userTags = await loadFollowedTags();
                            const mergedTags = Array.from(new Set([...DEFAULT_FOLLOWED_TAGS, ...userTags]));
                            setFollowedTagsState(mergedTags);
                            console.log("[extension] Auth initialized with extension session:", npub);
                        } catch {
                            console.log("[extension] No extension session available, using defaults.");
                            setFollowedTagsState(loadedTags);
                        }
                    } else {
                        setFollowedTagsState(loadedTags);
                        console.log("Auth initialized, no stored credentials.");
                    }
                }
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
    }, [loadNsecFromDb, loadFollowedTags, restoreNip46Session]);

    // Load followed tags on mount, regardless of login state
    useEffect(() => {
        const initializeTags = async () => {
            const storedTags = await loadFollowedTags();
            setFollowedTagsState(storedTags);
        };
        initializeTags();
    }, [loadFollowedTags]);

    // Load video tags on mount, regardless of login state
    useEffect(() => {
        const initializeVideoTags = async () => {
            const storedTags = await loadVideoTags();
            setVideoTagsState(storedTags);
        };
        initializeVideoTags();
    }, [loadVideoTags]);

    // Load music tags on mount, regardless of login state
    useEffect(() => {
        const initializeMusicTags = async () => {
            const storedTags = await loadMusicTags();
            setMusicTagsState(storedTags);
        };
        initializeMusicTags();
    }, [loadMusicTags]);

    // --- Mute List (Kind 10000) ---
    const fetchMuteList = useCallback(async () => {
        if (!ndkInstance || !currentUserNpub) {
            return [];
        }

        try {
            const decoded = nip19.decode(currentUserNpub);
            if (decoded.type !== 'npub') return [];
            const pubkeyHex = decoded.data as string;

            console.log("[mute] Fetching mute list for pubkey:", pubkeyHex.substring(0, 16) + "...");

            const filter = { kinds: [10000], authors: [pubkeyHex], limit: 1 };
            const subscription = ndkInstance.subscribe(filter, { closeOnEose: true });

            return new Promise<string[]>((resolve) => {
                let foundEvent = false;
                subscription.on('event', (event) => {
                    foundEvent = true;
                    const muted = event.tags
                        .filter(tag => tag[0] === 'p' && tag[1])
                        .map(tag => tag[1]);
                    console.log("[mute] Found mute list with", muted.length, "entries");
                    setMutedPubkeys(muted);
                    resolve(muted);
                });
                subscription.on('eose', () => {
                    if (!foundEvent) {
                        console.log("[mute] No mute list found, using empty list");
                        setMutedPubkeys([]);
                        resolve([]);
                    }
                });
                setTimeout(() => {
                    if (!foundEvent) {
                        resolve([]);
                    }
                    subscription.stop();
                }, 10000); // 10 second timeout
            });
        } catch (error) {
            console.error("[mute] Error fetching mute list:", error);
            return [];
        }
    }, [ndkInstance, currentUserNpub]);

    // Fetch mute list when user logs in
    useEffect(() => {
        if (currentUserNpub && isLoggedIn) {
            fetchMuteList();
        }
    }, [currentUserNpub, isLoggedIn, fetchMuteList]);

    // --- Signer Logic ---
    const cachedSignerRef = useRef<NDKPrivateKeySigner | NDKNip46Signer | undefined>(undefined);
    const cachedNsecRef = useRef<string | null>(null);
    const cachedNip46PayloadRef = useRef<string | null>(null);

    const getNdkSigner = useCallback(async (): Promise<NDKPrivateKeySigner | NDKNip46Signer | undefined> => {
        if (nip46SessionPayload && ndkInstance) {
            if (cachedNip46PayloadRef.current === nip46SessionPayload && cachedSignerRef.current) {
                return cachedSignerRef.current;
            }
            console.log("Restoring NIP-46 signer from session...");
            try {
                const signer = await NDKNip46Signer.fromPayload(nip46SessionPayload, ndkInstance);
                cachedSignerRef.current = signer;
                cachedNip46PayloadRef.current = nip46SessionPayload;
                cachedNsecRef.current = null;
                return signer;
            } catch (error) {
                console.error("Failed to restore NIP-46 signer:", error);
                return undefined;
            }
        } else if (currentUserNsec && ndkInstance) {
            if (cachedNsecRef.current === currentUserNsec && cachedSignerRef.current) {
                return cachedSignerRef.current;
            }
            try {
                const decoded = nip19.decode(currentUserNsec);
                if (decoded.type === 'nsec') {
                    const signer = new NDKPrivateKeySigner(decoded.data as Uint8Array);
                    cachedSignerRef.current = signer;
                    cachedNsecRef.current = currentUserNsec;
                    cachedNip46PayloadRef.current = null;
                    return signer;
                }
            } catch (error) {
                console.error("Failed to create NDKPrivateKeySigner from nsec:", error);
            }
        }
        return undefined;
    }, [currentUserNsec, nip46SessionPayload, ndkInstance]);

      const signEvent = useCallback(async (event: NostrEvent): Promise<NostrEvent | null> => {
        if (isExtensionSession && window.nostr) {
            try {
                console.log("[extension] Signing event with extension...");
                const signedEvent = await window.nostr.signEvent(event);
                console.log("[extension] Signed event:", signedEvent);
                return signedEvent as NostrEvent;
            } catch (error) {
                console.error("[extension] Failed to sign event:", error);
                setAuthError(`Extension sign failed: ${error instanceof Error ? error.message : String(error)}`);
                return null;
            }
        }

        const signer = await getNdkSigner();
        if (!signer) {
            setAuthError("Cannot sign event: No active signer (not logged in?).");
            console.error("signEvent called without an active signer.");
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
             const ndkEvent = new NDKEvent(ndkInstance ?? undefined);
             ndkEvent.kind = event.kind as number;
             ndkEvent.content = event.content;
             ndkEvent.tags = event.tags || [];

        } catch (error) {
             console.error("Failed to initiate NIP-46 connection:", error);
             setAuthError(`Failed to start remote sign-in: ${error instanceof Error ? error.message : String(error)}`);
             cancelNip46Connection();
        }
     }, [isExtensionSession, getNdkSigner, ndkInstance]);

    // --- NIP-44 Encryption/Decryption Helpers ---

    const getPrivateKeyBytes = (sk: string | Uint8Array): Uint8Array => {
        if (sk instanceof Uint8Array) return sk;
        return new Uint8Array(Buffer.from(sk, 'hex'));
    };

    // --- NIP-04/44 Methods (Using NDK Signer) ---
    const encryptDm = useCallback(async (recipientPubkeyHex: string, plaintext: string): Promise<string> => {
        const signer = await getNdkSigner();
        if (!signer) throw new Error("Cannot encrypt DM: No user signer available.");
        if (!ndkInstance) throw new Error("NDK instance not available for creating NDKUser.");

        if (signer instanceof NDKPrivateKeySigner) {
            const sk = signer.privateKey;
            if (!sk) throw new Error("Nsec signer has no private key.");
            const skBytes = getPrivateKeyBytes(sk);
            return nip44Encrypt(skBytes, recipientPubkeyHex, plaintext);
        } else if (signer instanceof NDKNip46Signer) {
            const recipientUser = new NDKUser({ pubkey: recipientPubkeyHex });
            recipientUser.ndk = ndkInstance;
            return signer.encrypt(recipientUser, plaintext);
        } else {
            throw new Error("Unsupported signer type for DM encryption.");
        }
    }, [ndk, ndk?.signer]);

    const decryptDm = useCallback(async (senderPubkeyHex: string, ciphertext: string): Promise<string> => {
        const signer = await getNdkSigner();
        if (!signer) throw new Error("Cannot decrypt DM: No user signer available.");
        if (!ndkInstance) throw new Error("NDK instance not available for creating NDKUser.");

        if (signer instanceof NDKPrivateKeySigner) {
            const sk = signer.privateKey;
            if (!sk) throw new Error("Nsec signer has no private key.");
            const skBytes = getPrivateKeyBytes(sk);
            return nip44Decrypt(skBytes, senderPubkeyHex, ciphertext);
        } else if (signer instanceof NDKNip46Signer) {
            const senderUser = new NDKUser({ pubkey: senderPubkeyHex });
            senderUser.ndk = ndkInstance;
            return signer.decrypt(senderUser, ciphertext);
        } else {
            throw new Error("Unsupported signer type for DM decryption.");
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
        hasExtension,
        initiateNip46Connection,
        connectWithBunkerUri,
        connectWithExtension,
        cancelNip46Connection,
        generateNewKeys,
        loginWithNsec,
        logout,
        saveNsecToDb,
        getNdkSigner,
        signEvent,
        followedTags,
        setFollowedTags,
        videoTags,
        setVideoTags,
        musicTags,
        setMusicTags,
        encryptDm,
        decryptDm,
        // Add new properties for hashtag filtering
        fetchImagesByTagEnabled,
        fetchVideosByTagEnabled,
        fetchMusicByTagEnabled,
        keywordSearch,
        setKeywordSearch,
        setFetchImagesByTagEnabled,
        setFetchVideosByTagEnabled,
        setFetchMusicByTagEnabled,
        // Mute list
        mutedPubkeys,
        ndk: ndkInstance, // Added NDK instance
    };
};