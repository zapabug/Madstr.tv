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

const DIAGNOSTIC_DISABLE_FUNCTIONALITY = false; // <-- SET BACK TO FALSE TO RE-ENABLE

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
    if (DIAGNOSTIC_DISABLE_FUNCTIONALITY) { // This condition will now be false
        console.warn('Auth Hook: DIAGNOSTIC_DISABLE_FUNCTIONALITY is TRUE. Returning minimal state.');
        return {
            activeSigner: undefined,
            currentUserNpub: null,
            currentUserNsecForBackup: null,
            isLoggedIn: false,
            isLoadingAuth: false,
            authError: null,
            nip46ConnectUri: null,
            isGeneratingUri: false,
            initiateNip46Connection: async () => { console.warn('Auth DIAGNOSTIC: initiateNip46Connection no-op'); },
            cancelNip46Connection: () => { console.warn('Auth DIAGNOSTIC: cancelNip46Connection no-op'); },
            generateNewKeys: async () => { console.warn('Auth DIAGNOSTIC: generateNewKeys no-op'); return null; },
            loginWithNsec: async () => { console.warn('Auth DIAGNOSTIC: loginWithNsec no-op'); return false; },
            logout: async () => { console.warn('Auth DIAGNOSTIC: logout no-op'); },
            followedTags: [],
            setFollowedTags: () => { console.warn('Auth DIAGNOSTIC: setFollowedTags no-op'); },
            fetchImagesByTagEnabled: false,
            setFetchImagesByTagEnabled: () => { console.warn('Auth DIAGNOSTIC: setFetchImagesByTagEnabled no-op'); },
            fetchVideosByTagEnabled: false,
            setFetchVideosByTagEnabled: () => { console.warn('Auth DIAGNOSTIC: setFetchVideosByTagEnabled no-op'); },
            encryptDm: async () => { console.warn('Auth DIAGNOSTIC: encryptDm no-op'); return ''; },
            decryptDm: async () => { console.warn('Auth DIAGNOSTIC: decryptDm no-op'); return ''; },
        };
    }

    // --- Get Stores from Context ---
    // DIAGNOSTIC: Restore useQueryStore
    const queryStore = Hooks.useQueryStore(); // Correct way to get QueryStore
    // const queryStore: QueryStore | null = null; // Or useMemo(() => ({}), []) if methods are called

    // --- Use the NIP-46 Hook ---
    // DIAGNOSTIC: Restore useNip46AuthManagement call
    const {
        nip46ConnectUri,
        isGeneratingUri,
        initiateNip46Connection: initiateNip46ConnectionInternal, // Rename internal hook function
        cancelNip46Connection: cancelNip46ConnectionInternal,   // Rename internal hook function
        restoreNip46Session,
        clearPersistedNip46Session,
        nip46Error,
    } = useNip46AuthManagement();
    /*
    const nip46ConnectUri: string | null = null;
    const isGeneratingUri = false;
    const initiateNip46ConnectionInternal = useCallback(async () => { console.log("Diag: useAuth.initiateNip46ConnectionInternal no-op"); return undefined; }, []);
    const cancelNip46ConnectionInternal = useCallback(() => { console.log("Diag: useAuth.cancelNip46ConnectionInternal no-op"); }, []);
    const restoreNip46Session = useCallback(async () => { console.log("Diag: useAuth.restoreNip46Session no-op"); return undefined; }, []);
    const clearPersistedNip46Session = useCallback(async () => { console.log("Diag: useAuth.clearPersistedNip46Session no-op"); }, []);
    const nip46Error: string | null = null;
    */
    // --- END DIAGNOSTIC ---

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

    // --- Load/Persist followed tags ---
    useEffect(() => {
        const loadTags = async () => {
            // DIAGNOSTIC: Restore content of this function
            console.info('Auth Hook: Attempting to load followed tags from IDB (loadTags effect)...');
            try {
                const loadedTags = await loadFollowedTagsFromDb();
                if (loadedTags) {
                    setFollowedTagsState(loadedTags);
                    console.info('Auth Hook: Successfully loaded followed tags (loadTags effect):', loadedTags);
                } else {
                    setFollowedTagsState([]); 
                    console.info('Auth Hook: No followed tags found in IDB, initialized as empty (loadTags effect).');
                }
            } catch (error) {
                console.error('Auth Hook: Failed to load followed tags from IDB (loadTags effect):', error);
                setNsecAuthError("Failed to load followed tags."); 
                setFollowedTagsState([]); 
            }
        };
        loadTags();
    }, []); 

    // Load all settings from IDB on mount
    useEffect(() => {
        const loadAllSettings = async () => {
            // DIAGNOSTIC: Content of this function is RESTORED, but most setStates are commented out
            try {
                console.info('Auth Hook: Attempting to load settings from IDB (ALL three setStates in loadAllSettings active)...');
                const settings = await loadSettingsFromDb();
                if (settings) {
                    // DIAGNOSTIC: RE-ENABLE setFollowedTagsState
                    setFollowedTagsState(settings.followedTags || []);
                    // DIAGNOSTIC: setFetchImagesByTagEnabledState is ACTIVE
                    setFetchImagesByTagEnabledState(settings.fetchImagesByTagEnabled === undefined ? true : settings.fetchImagesByTagEnabled);
                    // DIAGNOSTIC: setFetchVideosByTagEnabledState is ACTIVE
                    setFetchVideosByTagEnabledState(settings.fetchVideosByTagEnabled === undefined ? true : settings.fetchVideosByTagEnabled);
                    console.info('Auth Hook: Successfully loaded settings (ALL three setStates in loadAllSettings active):', settings);
                } else {
                    console.info('Auth Hook: No settings found in IDB, using defaults (ALL three setStates in loadAllSettings active).');
                }
            } catch (error) {
                console.error('Auth Hook: Failed to load settings from IDB:', error);
                setNsecAuthError("Failed to load settings.");
            }
        };
        loadAllSettings();
    }, []);

    // --- Initialization Effect ---
    useEffect(() => {
        const initializeAuth = async () => {
            // DIAGNOSTIC: Restore content of this function
            console.info("useAuth: Initializing authentication (initializeAuth effect)...");
            if (!queryStore) {
                console.info("useAuth: QueryStore not ready yet, waiting (initializeAuth effect)...");
                // setIsLoadingAuth(true); // Prevent loop if queryStore is initially undefined then defined rapidly
                return;
            }
            // if (activeSigner) { // Check moved after isLoadingAuth set to true
            //      console.info("useAuth: Already logged in (activeSigner state exists). Skipping initialization.");
            //      setIsLoadingAuth(false);
            //      return;
            // }
            console.info("useAuth: No active signer found OR queryStore just became available, checking storage (initializeAuth effect)...");
            // DIAGNOSTIC: Comment out setIsLoadingAuth(true)
            // setIsLoadingAuth(true);
            setNsecAuthError(null);

            if (activeSigner) { // Re-check activeSigner after setting isLoadingAuth to true
                 console.info("useAuth: ActiveSigner became available while waiting for queryStore or during init. Skipping further storage checks.");
                 // DIAGNOSTIC: Comment out setIsLoadingAuth(false)
                 // setIsLoadingAuth(false);
                 return;
            }

            try {
                const restoredNip46Signer = await restoreNip46Session();
                if (restoredNip46Signer) {
                    console.info("useAuth: NIP-46 session restored successfully (initializeAuth effect).");
                    setActiveSigner(restoredNip46Signer);
                    setCurrentUserNsecForBackup(null);
                } else {
                    console.info("useAuth: No NIP-46 session restored, checking for nsec (initializeAuth effect)...");
                    const nsec = await loadNsecFromDb();
                    if (nsec) {
                        console.info("useAuth: Found stored nsec. Logging in (initializeAuth effect)...");
                        try {
                             const decoded = nip19.decode(nsec);
                             if (decoded.type !== 'nsec' || !(decoded.data instanceof Uint8Array)) {
                                 throw new Error("Invalid stored nsec format.");
                             }
                            const privateKeySigner = new SimpleSigner(decoded.data);
                            await privateKeySigner.getPublicKey(); // Verify key
                            setActiveSigner(privateKeySigner);
                            setCurrentUserNsecForBackup(nsec);
                        } catch (nsecError) {
                            console.error("useAuth: Failed to create signer from stored nsec (initializeAuth effect):", nsecError);
                            setNsecAuthError("Invalid stored login key. Please log in again.");
                            await clearNsecFromDb();
                            setActiveSigner(undefined);
                            setCurrentUserNsecForBackup(null);
                        }
                    } else {
                        console.info("useAuth: No nsec found. User is not logged in (initializeAuth effect).");
                        setActiveSigner(undefined);
                        setCurrentUserNsecForBackup(null);
                    }
                }
            } catch (error) {
                console.error("useAuth: Error during auth initialization (initializeAuth effect):", error);
                setNsecAuthError("An error occurred during login check.");
                setActiveSigner(undefined);
                setCurrentUserNsecForBackup(null);
            } finally {
                // DIAGNOSTIC: Comment out setIsLoadingAuth(false)
                // setIsLoadingAuth(false);
                console.info("useAuth: Auth initialization finished (initializeAuth effect).");
            }
        }; 
        
        // Condition for running initializeAuth
        if (queryStore && !activeSigner) { // Only run if queryStore is available AND no signer yet
             console.log("initializeAuth effect: queryStore available and no activeSigner. Running init.");
             initializeAuth();
        } else if (!queryStore) {
             console.log("initializeAuth effect: queryStore NOT available. Will re-run when it is.");
             // setIsLoadingAuth(true); // Keep loading true if queryStore is missing
        } else if (activeSigner) {
             console.log("initializeAuth effect: activeSigner already exists. Not running init. Setting isLoadingAuth to false (COMMENTED OUT).");
             // DIAGNOSTIC: Comment out setIsLoadingAuth(false)
             // setIsLoadingAuth(false); // Already initialized and have a signer
        }

         return () => {
              // console.info("useAuth: Unmounting initializeAuth effect / deps changed.");
         };
    }, [queryStore, activeSigner]); // DIAGNOSTIC: Temporarily remove restoreNip46Session from deps

    // --- Fallback for isLoadingAuth if all init effects are effectively empty ---
    /* DIAGNOSTIC: Temporarily comment out isLoadingAuth fallback useEffect
    useEffect(() => {
        // If initializeAuth, loadTags, and loadAllSettings are commented out,
        // isLoadingAuth might remain true. This ensures it becomes false.
        // This is a DIAGNOSTIC fallback.
        const timer = setTimeout(() => {
            if (isLoadingAuth) {
                console.warn("useAuth DIAGNOSTIC: Forcing isLoadingAuth to false as init effects are out.");
                setIsLoadingAuth(false);
            }
        }, 100); // Short delay
        return () => clearTimeout(timer);
    }, [isLoadingAuth]);
    */

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
    const returnValue = {
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

    // DIAGNOSTIC: Wrap the entire return object in useMemo, but make it depend on its contents.
    // This ensures App.tsx gets a new object reference IFF any of these primitive values change.
    return useMemo(() => returnValue, [
        activeSigner,
        currentUserNpub,
        currentUserNsecForBackup,
        isLoadingAuth,
        authError,
        nip46ConnectUri,
        isGeneratingUri,
        initiateNip46Connection, // These are callbacks, ensure they are stable (useCallback)
        cancelNip46Connection,
        generateNewKeys,
        loginWithNsec,
        logout,
        followedTags, // This is a state variable (array)
        setFollowedTags, // Stable callback
        fetchImagesByTagEnabled, // This is a state variable (boolean)
        setFetchImagesByTagEnabled, // Stable callback
        fetchVideosByTagEnabled, // This is a state variable (boolean)
        setFetchVideosByTagEnabled, // Stable callback
        encryptDm, // Stable callback
        decryptDm // Stable callback
    ]); 

    // Original return:
    // return returnValue;
};
