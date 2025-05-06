import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Buffer } from 'buffer';
import { nip19, generateSecretKey, getPublicKey } from 'nostr-tools';
// Applesauce imports
import { Hooks } from 'applesauce-react';
import { QueryStore } from 'applesauce-core';
import { SimpleSigner, NostrConnectSigner, Nip07Interface } from 'applesauce-signers';
// import { Nip07Interface } from 'applesauce-signers/dist/nip07'; // Removed deep import

// Import the new NIP-46 hook
import { useNip46AuthManagement } from './useNip46AuthManagement';

// IDB Utilities
import {
    saveNsecToDb,
    loadNsecFromDb,
    clearNsecFromDb,
    loadFollowedTagsFromDb, // Added import
    saveFollowedTagsToDb,   // Added import
    loadSettingsFromDb, 
    saveSettingsToDb,
} from '../utils/idb';

// Assuming RELAYS are defined elsewhere if needed directly (e.g., maybe not needed here anymore)
// import { RELAYS } from '../constants/relays';

// Interface for settings stored in IDB
interface AppSettings {
    followedTags?: string[];
    fetchImagesByTagEnabled?: boolean;
    fetchVideosByTagEnabled?: boolean;
    defaultTipAmount?: number;
    // Add other settings here as needed
}

// Updated Return Type
export interface UseAuthReturn {
    activeSigner: Nip07Interface | undefined;
    currentUserNpub: string | null;
    currentUserNsecForBackup: string | null;
    isLoggedIn: boolean;
    isLoadingAuth: boolean;
    authError: string | null; // Consolidated error state
    nip46ConnectUri: string | null; // State from useNip46AuthManagement
    isGeneratingUri: boolean; // State from useNip46AuthManagement
    initiateNip46Connection: () => Promise<void>; // Updated signature
    cancelNip46Connection: () => void; // Delegated
    generateNewKeys: () => Promise<{ npub: string; nsec: string } | null>;
    loginWithNsec: (nsec: string) => Promise<boolean>;
    logout: () => Promise<void>;
    followedTags: string[];
    setFollowedTags: (tags: string[]) => void;
    fetchImagesByTagEnabled: boolean;
    setFetchImagesByTagEnabled: (enabled: boolean) => void;
    fetchVideosByTagEnabled: boolean;
    setFetchVideosByTagEnabled: (enabled: boolean) => void;
    encryptDm: (recipientNpub: string, plaintext: string) => Promise<string>; // Changed param name for clarity
    decryptDm: (senderNpub: string, ciphertext: string) => Promise<string>; // Changed param name for clarity
}


// The hook itself
export const useAuth = (): UseAuthReturn => {
    // --- Get Stores from Context ---
    const queryStore = Hooks.useQueryStore(); // Correct way to get QueryStore

    // --- Use the NIP-46 Hook ---
    const {
        nip46ConnectUri,
        isGeneratingUri,
        initiateNip46Connection: initiateNip46ConnectionInternal, // Rename internal hook function
        cancelNip46Connection: cancelNip46ConnectionInternal,   // Rename internal hook function
        restoreNip46Session,
        clearPersistedNip46Session,
        nip46Error,
    } = useNip46AuthManagement();

    // --- Core State ---
    const [activeSigner, setActiveSigner] = useState<Nip07Interface | undefined>(undefined);
    const [currentUserNpub, setCurrentUserNpub] = useState<string | null>(null);
    const [currentUserNsecForBackup, setCurrentUserNsecForBackup] = useState<string | null>(null);
    const [isLoadingAuth, setIsLoadingAuth] = useState<boolean>(true);
    const [nsecAuthError, setNsecAuthError] = useState<string | null>(null); // Specific error for nsec/general
    const authError = nip46Error || nsecAuthError; // Combined error state, prioritize NIP-46

    // Removed NIP-46 specific state and refs - handled by useNip46AuthManagement

    // Followed tags state
    const [followedTags, setFollowedTagsState] = useState<string[]>([]);

    // State for settings
    const [fetchImagesByTagEnabled, setFetchImagesByTagEnabledState] = useState<boolean>(true); // Default to true
    const [fetchVideosByTagEnabled, setFetchVideosByTagEnabledState] = useState<boolean>(true); // Default to true

    // --- Update derived currentUserNpub when activeSigner changes ---
    useEffect(() => {
        const updateNpub = async () => {
            if (activeSigner) {
                try {
                    const pubkey = await activeSigner.getPublicKey();
                    setCurrentUserNpub(nip19.npubEncode(pubkey));
                } catch (e) {
                    console.error("Failed to get public key from active signer:", e);
                    setCurrentUserNpub(null);
                    // Potentially set an error state here?
                    setNsecAuthError(`Failed to get pubkey from active signer: ${e instanceof Error ? e.message : String(e)}`);
                }
            } else {
                setCurrentUserNpub(null);
            }
        };
        updateNpub();
    }, [activeSigner]);

    // --- Load/Persist followed tags ---
    useEffect(() => {
        const loadTags = async () => {
            try {
                console.info('Auth Hook: Attempting to load followed tags from IDB...');
                const loadedTags = await loadFollowedTagsFromDb();
                if (loadedTags) {
                    setFollowedTagsState(loadedTags);
                    console.info('Auth Hook: Successfully loaded followed tags:', loadedTags);
                } else {
                    setFollowedTagsState([]); // Initialize with empty array if nothing is stored
                    console.info('Auth Hook: No followed tags found in IDB, initialized as empty.');
                }
            } catch (error) {
                console.error('Auth Hook: Failed to load followed tags from IDB:', error);
                setNsecAuthError("Failed to load followed tags."); // Use existing error state for simplicity
                setFollowedTagsState([]); // Ensure it's an empty array on error
            }
        };
        loadTags();
    }, []); // Intentionally empty dependency array to run once on mount

    // Load all settings from IDB on mount
    useEffect(() => {
        const loadAllSettings = async () => {
            try {
                console.info('Auth Hook: Attempting to load settings from IDB...');
                const settings = await loadSettingsFromDb();
                if (settings) {
                    setFollowedTagsState(settings.followedTags || []);
                    setFetchImagesByTagEnabledState(settings.fetchImagesByTagEnabled === undefined ? true : settings.fetchImagesByTagEnabled);
                    setFetchVideosByTagEnabledState(settings.fetchVideosByTagEnabled === undefined ? true : settings.fetchVideosByTagEnabled);
                    console.info('Auth Hook: Successfully loaded settings:', settings);
                } else {
                    console.info('Auth Hook: No settings found in IDB, using defaults.');
                    // Defaults are already set by useState initial values
                }
            } catch (error) {
                console.error('Auth Hook: Failed to load settings from IDB:', error);
                setNsecAuthError("Failed to load settings.");
            }
        };
        loadAllSettings();
    }, []);

    // Helper to save all settings
    const saveCurrentSettings = useCallback(async (updatedSettings: Partial<AppSettings>) => {
        try {
            // Construct the full settings object to save
            const currentSettingsToSave: AppSettings = {
                followedTags,
                fetchImagesByTagEnabled,
                fetchVideosByTagEnabled,
                ...updatedSettings, // Apply specific updates
            };
            await saveSettingsToDb(currentSettingsToSave);
            console.info('Auth Hook: Successfully persisted settings to IDB:', currentSettingsToSave);
        } catch (error) {
            console.error('Auth Hook: Failed to save settings:', error);
            setNsecAuthError("Failed to save settings.");
        }
    }, [followedTags, fetchImagesByTagEnabled, fetchVideosByTagEnabled]);

    const setFollowedTags = useCallback(async (tags: string[]) => {
        try {
            console.log('Auth Hook: setFollowedTags called with:', tags); // Added log
            setFollowedTagsState(tags);
            await saveCurrentSettings({ followedTags: tags });
            console.info('Auth Hook: Successfully persisted followed tags to IDB:', tags);
        } catch (error) {
            console.error('Auth Hook: Failed to save followed tags:', error);
            setNsecAuthError("Failed to save followed tags.");
        }
    }, [saveCurrentSettings]);

    const setFetchImagesByTagEnabled = useCallback(async (enabled: boolean) => {
        setFetchImagesByTagEnabledState(enabled);
        await saveCurrentSettings({ fetchImagesByTagEnabled: enabled });
    }, [saveCurrentSettings]);

    const setFetchVideosByTagEnabled = useCallback(async (enabled: boolean) => {
        setFetchVideosByTagEnabledState(enabled);
        await saveCurrentSettings({ fetchVideosByTagEnabled: enabled });
    }, [saveCurrentSettings]);

    // --- NIP-46 Connection Initiation (Wrapper) ---
    const initiateNip46Connection = useCallback(async () => {
        setIsLoadingAuth(true); // Indicate general auth process is happening
        setNsecAuthError(null); // Clear other auth errors
        setActiveSigner(undefined); // Clear any existing signer
        setCurrentUserNpub(null);
        setCurrentUserNsecForBackup(null);

        console.info("useAuth: Initiating NIP-46 connection via useNip46AuthManagement...");
        const connectedSigner = await initiateNip46ConnectionInternal();

        if (connectedSigner) {
            console.info("useAuth: NIP-46 connection successful, activating signer.");
            setActiveSigner(connectedSigner); // Activate the signer returned by the hook
            await clearNsecFromDb(); // Clear any potentially conflicting nsec
            // User pubkey/npub will be updated by the useEffect watching activeSigner
        } else {
            console.info("useAuth: NIP-46 connection failed or cancelled.");
            // Error state (nip46Error) is handled by the useNip46AuthManagement hook and combined in authError
            setActiveSigner(undefined); // Ensure signer is cleared on failure
            setCurrentUserNpub(null);
        }
        setIsLoadingAuth(false); // Auth process finished (success or fail)
    }, [initiateNip46ConnectionInternal, setActiveSigner]); // Depend on the internal hook function

    // --- Cancel NIP-46 Connection (Delegated) ---
    const cancelNip46Connection = useCallback(() => {
        console.info("useAuth: Cancelling NIP-46 connection via useNip46AuthManagement...");
        cancelNip46ConnectionInternal(); // Just call the hook's function
        // isLoadingAuth might need to be reset depending on UX, but initiate handles it generally
    }, [cancelNip46ConnectionInternal]);


    // --- Login / Logout Logic ---
    const loginWithNsec = useCallback(async (nsec: string): Promise<boolean> => {
        setIsLoadingAuth(true);
        setNsecAuthError(null);
        setActiveSigner(undefined);
        setCurrentUserNpub(null);
        setCurrentUserNsecForBackup(null);
        console.info("Attempting login with nsec...");
        // Ensure no NIP-46 attempt is ongoing or persisted incorrectly
        cancelNip46ConnectionInternal(); // Cancel any active attempt
        await clearPersistedNip46Session(); // Clear any potentially invalid persisted NIP-46 session

        try {
            const trimmedNsec = nsec.trim();
            const decoded = nip19.decode(trimmedNsec);
            if (decoded.type !== 'nsec' || !(decoded.data instanceof Uint8Array)) {
                throw new Error("Invalid nsec format provided.");
            }
            const privateKeySigner = new SimpleSigner(decoded.data);
            const pubkey = await privateKeySigner.getPublicKey();

            setActiveSigner(privateKeySigner);
            console.info("Logged in with nsec, user:", nip19.npubEncode(pubkey));
            setCurrentUserNsecForBackup(trimmedNsec); // Set backup nsec
            await saveNsecToDb(trimmedNsec); // Persist nsec

            setIsLoadingAuth(false);
            return true;
        } catch (e: any) {
            console.error("Error logging in with nsec:", e);
            const message = `Login failed: ${e.message || 'Invalid nsec'}`;
            setNsecAuthError(message);
            setActiveSigner(undefined);
            setCurrentUserNpub(null);
            setCurrentUserNsecForBackup(null);
            await clearNsecFromDb(); // Ensure nsec is cleared on failure
            // Don't clear NIP-46 again here
            setIsLoadingAuth(false);
            return false;
        }
    }, [setActiveSigner, clearPersistedNip46Session, cancelNip46ConnectionInternal]); // Added NIP-46 cleanup dependencies


    const generateNewKeys = useCallback(async (): Promise<{ npub: string; nsec: string } | null> => {
        console.info("Generating new keys...");
        setIsLoadingAuth(true);
        setNsecAuthError(null);
        setActiveSigner(undefined); // Clear previous signer/state
        setCurrentUserNpub(null);
        setCurrentUserNsecForBackup(null);
        // Ensure no NIP-46 attempt is ongoing or persisted incorrectly
        cancelNip46ConnectionInternal(); // Cancel any active attempt
        await clearPersistedNip46Session(); // Clear any potentially invalid persisted NIP-46 session

        try {
            const skBytes = generateSecretKey();
            const pkHex = getPublicKey(skBytes);
            const nsec = nip19.nsecEncode(skBytes);
            const npub = nip19.npubEncode(pkHex);
            console.info("Generated new keys - npub:", npub);

            // Use the login function which handles setting state and persistence
            const loggedIn = await loginWithNsec(nsec); // loginWithNsec handles setting loading state
            if (loggedIn) {
                return { npub, nsec };
            } else {
                // Error should be set by loginWithNsec
                throw new Error("Failed to log in with newly generated keys.");
            }
        } catch (error) {
            console.error("Failed to generate or login with new keys:", error);
            // Avoid duplicate state setting if loginWithNsec failed and set the error
            if (!nsecAuthError) {
                 setNsecAuthError(`Key generation failed: ${error instanceof Error ? error.message : String(error)}`);
            }
            // Ensure cleanup even if loginWithNsec wasn't reached or failed early
            setActiveSigner(undefined);
            setCurrentUserNpub(null);
            setCurrentUserNsecForBackup(null);
            setIsLoadingAuth(false); // Ensure loading is false if login didn't handle it
            return null;
        }
    }, [loginWithNsec, setActiveSigner, nsecAuthError, clearPersistedNip46Session, cancelNip46ConnectionInternal]);


    const logout = useCallback(async () => {
        console.info("Logging out...");
        setIsLoadingAuth(true);
        setNsecAuthError(null);
        // No need to clear nip46Error here, it will clear if user tries NIP-46 again

        // Close NIP-46 signer if active
        if (activeSigner && typeof (activeSigner as any).close === 'function') {
            try {
                console.info("Closing active NostrConnectSigner session...");
                await (activeSigner as NostrConnectSigner).close();
            } catch (e) {
                 console.error("Error closing NostrConnectSigner on logout:", e);
                 // Set error state? Maybe less critical on logout.
            }
        }

        setActiveSigner(undefined); // Clear the active signer state
        setCurrentUserNpub(null);
        setCurrentUserNsecForBackup(null);

        // Clear all persisted auth data
        await clearNsecFromDb();
        await clearPersistedNip46Session(); // Use the function from the NIP-46 hook

        setIsLoadingAuth(false);
        console.info("Logout complete.");
    }, [activeSigner, setActiveSigner, clearPersistedNip46Session]); // Added NIP-46 clear dependency


    // --- Initialization Effect ---
    useEffect(() => {
        const initializeAuth = async () => {
            console.info("useAuth: Initializing authentication...");
            if (!queryStore) {
                console.info("useAuth: QueryStore not ready yet, waiting...");
                // Don't set loading false here, wait for store
                return;
            }
            if (activeSigner) {
                 console.info("useAuth: Already logged in (activeSigner state exists). Skipping initialization.");
                 setIsLoadingAuth(false); // Already initialized
                 return;
            }

            console.info("useAuth: No active signer found, checking storage...");
            setIsLoadingAuth(true);
            setNsecAuthError(null);
            // nip46Error will be handled by restoreNip46Session if it runs

            try {
                // Attempt to restore NIP-46 session first
                const restoredNip46Signer = await restoreNip46Session();

                if (restoredNip46Signer) {
                    console.info("useAuth: NIP-46 session restored successfully.");
                    setActiveSigner(restoredNip46Signer);
                    setCurrentUserNsecForBackup(null); // Ensure no nsec backup if NIP-46 is active
                    // Pubkey/npub set by effect watching activeSigner
                } else {
                    // If NIP-46 restore failed or no data, try nsec
                    console.info("useAuth: No NIP-46 session restored, checking for nsec...");
                    // Note: nip46Error might be set by restoreNip46Session if it failed
                    const nsec = await loadNsecFromDb();
                    if (nsec) {
                        console.info("useAuth: Found stored nsec. Logging in...");
                        try {
                             const decoded = nip19.decode(nsec);
                             if (decoded.type !== 'nsec' || !(decoded.data instanceof Uint8Array)) {
                                 throw new Error("Invalid stored nsec format.");
                             }
                            const privateKeySigner = new SimpleSigner(decoded.data);
                            const pubkey = await privateKeySigner.getPublicKey(); // Verify key
                            console.info("useAuth: Logged in successfully with nsec for user:", nip19.npubEncode(pubkey));
                            setActiveSigner(privateKeySigner);
                            setCurrentUserNsecForBackup(nsec);
                            // Clear any lingering NIP-46 error from failed restore attempt
                            // Note: clearPersistedNip46Session is NOT called here, preserve potentially recoverable NIP-46 data
                        } catch (nsecError) {
                            console.error("useAuth: Failed to create signer from stored nsec:", nsecError);
                            setNsecAuthError("Invalid stored login key. Please log in again.");
                            await clearNsecFromDb(); // Clear invalid nsec
                            setActiveSigner(undefined);
                            setCurrentUserNsecForBackup(null);
                        }
                    } else {
                        console.info("useAuth: No nsec found. User is not logged in.");
                        setActiveSigner(undefined);
                        setCurrentUserNsecForBackup(null);
                        // No auth methods succeeded. nip46Error might still be set if restore failed.
                    }
                }

            } catch (error) {
                console.error("useAuth: Error during auth initialization:", error);
                setNsecAuthError("An error occurred during login check.");
                setActiveSigner(undefined);
                setCurrentUserNsecForBackup(null);
                // Potentially clear all storage? Maybe too aggressive.
                // await clearNsecFromDb();
                // await clearPersistedNip46Session();
            } finally {
                setIsLoadingAuth(false);
                console.info("useAuth: Auth initialization finished.");
            }
        }; // End of initializeAuth

        // Only run init if queryStore is available and not already logged in
        if (queryStore && !activeSigner) {
             initializeAuth();
        } else if (!queryStore) {
             // Still waiting for queryStore, keep loading true
             setIsLoadingAuth(true);
        } else {
             // queryStore exists AND activeSigner exists, we are done loading
             setIsLoadingAuth(false);
        }

         // Cleanup function (optional, maybe not needed here)
         return () => {
              console.info("useAuth: Unmounting.");
         };
    // Dependencies: queryStore changes trigger re-check; activeSigner prevents re-run once logged in.
    // restoreNip46Session is stable from useCallback in its hook.
    }, [queryStore, activeSigner, setActiveSigner, restoreNip46Session]);

    // --- NIP-04 DM Helpers ---
    const encryptDm = useCallback(async (recipientNpub: string, content: string): Promise<string> => {
        const currentSigner = activeSigner;
        if (!currentSigner) throw new Error("Not logged in / Signer not available");
        if (!currentSigner.nip04?.encrypt) throw new Error("Active signer does not support NIP-04 encryption");

        let recipientHex: string;
        try {
            const decoded = nip19.decode(recipientNpub.trim());
            if (decoded.type !== 'npub') throw new Error("Invalid recipient format (expected npub)");
            recipientHex = decoded.data as string; // data is string for npub
        } catch (e: any) {
             throw new Error(`Invalid recipient npub: ${e.message}`);
        }
        try {
            return await currentSigner.nip04.encrypt(recipientHex, content);
        } catch (error) {
            console.error("Encryption failed:", error);
            throw new Error(`Encryption failed: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
    }, [activeSigner]);

     const decryptDm = useCallback(async (senderNpub: string, encryptedContent: string): Promise<string> => {
        const currentSigner = activeSigner;
        if (!currentSigner) throw new Error("Not logged in / Signer not available");
        if (!currentSigner.nip04?.decrypt) throw new Error("Active signer does not support NIP-04 decryption");

        let senderHex: string;
        try {
            const decoded = nip19.decode(senderNpub.trim());
            if (decoded.type !== 'npub') throw new Error("Invalid sender format (expected npub)");
            senderHex = decoded.data as string; // data is string for npub
         } catch (e: any) {
             throw new Error(`Invalid sender npub: ${e.message}`);
         }
         try {
            return await currentSigner.nip04.decrypt(senderHex, encryptedContent);
        } catch (error) {
            console.error("Decryption failed:", error);
            throw new Error(`Decryption failed: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
    }, [activeSigner]);

    // --- Return hook state and methods ---
    return {
        activeSigner,
        currentUserNpub,
        currentUserNsecForBackup,
        isLoggedIn: !!activeSigner, // Derived
        isLoadingAuth,
        authError, // Use the combined error state
        nip46ConnectUri, // From useNip46AuthManagement
        isGeneratingUri, // From useNip46AuthManagement
        initiateNip46Connection, // Wrapper function
        cancelNip46Connection, // Delegated function
        generateNewKeys,
        loginWithNsec,
        logout,
        followedTags,
        setFollowedTags,
        fetchImagesByTagEnabled,
        setFetchImagesByTagEnabled,
        fetchVideosByTagEnabled,
        setFetchVideosByTagEnabled,
        encryptDm,
        decryptDm,
    };
};
