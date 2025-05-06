import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Buffer } from 'buffer';
import { nip19, generateSecretKey } from 'nostr-tools';
import { SimpleSigner, NostrConnectSigner } from 'applesauce-signers';
import { QueryStore } from 'applesauce-core';
import { Hooks } from 'applesauce-react'; // Assuming Hooks.useQueryStore exists

// Assuming these are defined elsewhere and imported
import { RELAYS } from '../constants';
import { StoredNip46Data, saveNip46DataToDb, loadNip46DataFromDb, clearNip46DataFromDb } from '../utils/idb'; // Adjust path if needed

// Define the return type for the hook
export interface UseNip46AuthManagementReturn {
    nip46ConnectUri: string | null;
    isGeneratingUri: boolean;
    initiateNip46Connection: () => Promise<NostrConnectSigner | null>; // Returns signer on success
    cancelNip46Connection: () => void;
    restoreNip46Session: () => Promise<NostrConnectSigner | null>; // Returns signer on success
    clearPersistedNip46Session: () => Promise<void>; // Function to clear DB entry
    nip46Error: string | null; // Expose specific NIP-46 errors
}

export const useNip46AuthManagement = (): UseNip46AuthManagementReturn => {
    const queryStore = Hooks.useQueryStore();
    const [nip46ConnectUri, setNip46ConnectUri] = useState<string | null>(null);
    const [isGeneratingUri, setIsGeneratingUri] = useState<boolean>(false);
    const [nip46Error, setNip46Error] = useState<string | null>(null);
    const connectingNip46SignerRef = useRef<NostrConnectSigner | null>(null);

    const cleanupNip46Attempt = useCallback(async (errorMessage?: string) => {
        console.info('Cleaning up NIP-46 connection attempt...');
        if (connectingNip46SignerRef.current) {
            try {
                await connectingNip46SignerRef.current.close();
                console.info('Closed connecting NIP-46 signer instance.');
            } catch (e) {
                console.error("Error closing connecting NIP-46 signer:", e);
                // Don't overwrite specific error with cleanup error unless none exists
                if (!errorMessage) {
                    setNip46Error(`Failed to close NIP-46 signer: ${e instanceof Error ? e.message : String(e)}`);
                }
            }
            connectingNip46SignerRef.current = null;
        }
        setNip46ConnectUri(null);
        setIsGeneratingUri(false);
        if (errorMessage) {
            setNip46Error(errorMessage);
        }
        // Don't clear the error here if no new message, might clear a previous relevant error
    }, []);

    const initiateNip46Connection = useCallback(async (): Promise<NostrConnectSigner | null> => {
        if (!queryStore) {
            setNip46Error("QueryStore not available.");
            console.error("useNip46Auth: QueryStore not available.");
            setIsGeneratingUri(false); // Ensure state is reset
            return null;
        }
        console.info("Initiating NIP-46 connection...");
        setIsGeneratingUri(true);
        setNip46Error(null); // Clear previous errors
        setNip46ConnectUri(null);
        await cleanupNip46Attempt(); // Clean up any previous attempt without error message

        try {
            const localSecretKeyBytes = generateSecretKey();
            const localSigner = new SimpleSigner(localSecretKeyBytes);
            const localSecretKeyHex = Buffer.from(localSecretKeyBytes).toString('hex');

            const nip46Signer = new NostrConnectSigner({
                localSigner: localSigner,
                relays: RELAYS,
            });
            connectingNip46SignerRef.current = nip46Signer;

            const connectUri = nip46Signer.getNostrConnectURI({
                metadata: {
                    name: "Nostr TV App",
                    url: window.location.origin,
                    description: "Nostr media experience for your TV",
                },
            });
            console.info("Generated NIP-46 Connect URI:", connectUri);
            setNip46ConnectUri(connectUri);

            console.info("Waiting for NIP-46 connection...");
            await nip46Signer.connect(); // Wait for connection
            console.info("NIP-46 connection successful!");

            const connectedSignerInstance = connectingNip46SignerRef.current;
            connectingNip46SignerRef.current = null; // Clear ref, connection established

             if (!connectedSignerInstance) {
                 throw new Error("NIP-46 Signer instance lost after successful connection.");
             }

            const connectedUserPubkey = await connectedSignerInstance.getPublicKey();

            // TODO: How to get remotePubkey after initial connection?
            // const remotePubkey = connectedSignerInstance.remotePubkey; // This line caused a linter error
            // const localSecretKeyHex = Buffer.from(localSigner.getSecretKey()).toString('hex'); // Incorrect: Re-declaration and SimpleSigner has no getSecretKey

            /* // Temporarily disable persistence until remotePubkey is resolved
            const sessionDataToSave: Omit<StoredNip46Data, 'id'> = {
                localSecret: localSecretKeyHex,
                remotePubkey: remotePubkey, // Need this value
                connectedUserPubkey: connectedUserPubkey,
                relays: RELAYS,
            };
            await saveNip46DataToDb(sessionDataToSave);
            console.info("NIP-46 session persisted for user:", nip19.npubEncode(connectedUserPubkey));
            */
            console.warn("NIP-46 session persistence temporarily disabled pending remotePubkey resolution.");

            setNip46ConnectUri(null); // Clear URI, connection done
            setIsGeneratingUri(false);
            return connectedSignerInstance; // Return the established signer

        } catch (error: any) {
            console.error("NIP-46 Connection failed:", error);
            const message = `NIP-46 Connection failed: ${error.message || 'Unknown error'}`;
            await cleanupNip46Attempt(message); // Clean up fully on failure, passing the error
            return null; // Indicate failure
        } finally {
             // Ensure loading state is reset if somehow missed
            if (connectingNip46SignerRef.current) { // If ref still exists (e.g., error before connect promise resolves/rejects)
                setIsGeneratingUri(false);
            }
        }
    }, [queryStore, cleanupNip46Attempt]);

    const cancelNip46Connection = useCallback(() => {
        console.info("Cancelling NIP-46 connection attempt...");
        cleanupNip46Attempt("NIP-46 connection cancelled by user."); // Clean up with cancellation message
    }, [cleanupNip46Attempt]);

    const restoreNip46Session = useCallback(async (): Promise<NostrConnectSigner | null> => {
        if (!queryStore) {
            // Don't set error here, as this runs during init. Let useAuth handle general init errors.
            console.error("useNip46Auth: QueryStore not available during restore attempt.");
            return null;
        }
        setNip46Error(null); // Clear previous NIP-46 errors during restore attempt

        console.info("Attempting to restore NIP-46 session...");
        const persistedNip46 = await loadNip46DataFromDb();

        if (persistedNip46 && persistedNip46.localSecret && persistedNip46.remotePubkey && persistedNip46.connectedUserPubkey) {
            try {
                const localSecretBytes = Buffer.from(persistedNip46.localSecret, 'hex');
                const localSigner = new SimpleSigner(localSecretBytes);

                const signer = new NostrConnectSigner({
                    localSigner: localSigner,
                    remotePubkey: persistedNip46.remotePubkey,
                    relays: persistedNip46.relays || RELAYS,
                });

                console.info("Attempting to connect restored NIP-46 signer...");
                // Use connect() which should implicitly handle connection/verification
                await signer.connect();
                console.info("Restored NIP-46 signer connected successfully.");

                const connectedPubkey = await signer.getPublicKey();
                if (connectedPubkey === persistedNip46.connectedUserPubkey) {
                    console.info("NIP-46 session restored successfully for user:", nip19.npubEncode(persistedNip46.connectedUserPubkey));
                    return signer; // Return the restored signer
                } else {
                    console.error("Failed to restore NIP-46 session: Pubkey mismatch after connect.", { connected: connectedPubkey, expected: persistedNip46.connectedUserPubkey });
                    await clearNip46DataFromDb(); // Clean up invalid session
                    setNip46Error("NIP-46 session invalid (pubkey mismatch). Please log in again.");
                    return null;
                }
            } catch (e: any) {
                console.error("Failed to connect restored NIP-46 session:", e);
                await clearNip46DataFromDb(); // Clean up failed session
                setNip46Error(`Failed to restore NIP-46 session: ${e.message || 'Connection error'}. Please log in again.`);
                return null;
            }
        } else {
            console.info("No complete NIP-46 data found in storage.");
            return null; // No data to restore
        }
    }, [queryStore]); // Dependency on queryStore

    const clearPersistedNip46Session = useCallback(async () => {
        console.info("Clearing persisted NIP-46 session data...");
        await clearNip46DataFromDb();
        setNip46Error(null); // Clear any errors related to the old session
    }, []);


    return {
        nip46ConnectUri,
        isGeneratingUri,
        initiateNip46Connection,
        cancelNip46Connection,
        restoreNip46Session,
        clearPersistedNip46Session,
        nip46Error,
    };
}; 