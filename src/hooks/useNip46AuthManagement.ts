import React, { useState, useCallback, useRef, useEffect } from 'react';
// import { Buffer } from 'buffer'; // REMOVE Buffer import
import { nip19, generateSecretKey, NostrEvent, Filter } from 'nostr-tools'; // Remove SubCloser import
import { SimpleSigner, NostrConnectSigner, NostrConnectSignerOptions, NostrConnectAppMetadata } from 'applesauce-signers';
import { EventStore } from 'applesauce-core'; // Import concrete EventStore class
import { Hooks } from 'applesauce-react'; // Assuming Hooks.useQueryStore exists
import { RELAYS } from '../constants';
import { StoredNip46Data, saveNip46DataToDb, loadNip46DataFromDb, clearNip46DataFromDb } from '../utils/idb'; // Adjust path if needed
import { bytesToHex, hexToBytes } from '../utils/hex'; // IMPORT new hex helpers
import { useRelayPool } from '../contexts/RelayPoolContext';

// Define the RxJS-like types locally as expected by NostrConnectSigner
interface MinimalUnsubscribable {
  unsubscribe(): void;
}

interface MinimalObserver<T> {
  next?: (value: T) => void;
  error?: (err: any) => void;
  complete?: () => void;
}

interface MinimalSubscribable<T> {
  subscribe: (observer: MinimalObserver<T>) => MinimalUnsubscribable;
}

// Minimal interface for the object returned by SimplePool.subscribeMany
interface MinimalPoolSubscription {
  close: () => void;
  // sub: (filters: Filter[], opts?: any) => MinimalPoolSubscription; // Not strictly needed for this adapter
}

// This is the type NostrConnectSigner actually expects for its subscriptionMethod
export type NostrConnectSubscriptionMethod =
    (relays: string[], filters: Filter[]) => MinimalSubscribable<NostrEvent>;

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
    const pool = useRelayPool();
    const queryStore = Hooks.useQueryStore();
    const eventStore = Hooks.useEventStore() as EventStore | undefined;
    const [nip46ConnectUri, setNip46ConnectUri] = useState<string | null>(null);
    const [isGeneratingUri, setIsGeneratingUri] = useState<boolean>(false);
    const [nip46Error, setNip46Error] = useState<string | null>(null);
    const connectingNip46SignerRef = useRef<NostrConnectSigner | null>(null);

    // Define wrapper for publish method
    const nostrPublishMethod: NostrConnectSignerOptions['publishMethod'] = useCallback(
        (relays: string[], event: NostrEvent) => {
            if (!pool) {
                console.error("Cannot publish: Relay pool not available.");
                return; // Return void
            }
            pool.publish(relays, event);
        },
        [pool]
    );

    // Define wrapper for subscription method
    const nostrSubscriptionMethod: NostrConnectSubscriptionMethod = useCallback(
        (
            relays: string[], // These are the specific NIP-46 relays
            filters: Filter[]
        ): MinimalSubscribable<NostrEvent> => {
            let subCloser: MinimalPoolSubscription | null = null; // Use minimal interface
            let active = true;

            return {
                subscribe: (observer: MinimalObserver<NostrEvent>): MinimalUnsubscribable => {
                    if (!active) { // Prevent re-subscription if already unsubscribed
                        console.warn("NostrConnectSigner: Attempted to subscribe to an already unsubscribed subscription.");
                        return { unsubscribe: () => {} };
                    }
                    if (!pool) {
                        console.error("nostrSubscriptionMethod: Relay pool not available for NIP-46 subscription.");
                        if (observer.error) {
                            observer.error(new Error("Relay pool not available for NIP-46 subscription."));
                        }
                        return { unsubscribe: () => {} };
                    }

                    console.log(`nostrSubscriptionMethod: Subscribing to NIP-46 relays:`, relays, 'with filters:', filters);

                    subCloser = pool.subscribeMany(
                        relays, // Use the EXPLICIT relays for NIP-46 communication
                        filters,
                        {
                            onevent: (event: NostrEvent) => {
                                if (active && observer.next) {
                                    // console.log('nostrSubscriptionMethod: received event for NIP-46', event);
                                    observer.next(event);
                                }
                            },
                            oneose: () => {
                                // console.log('nostrSubscriptionMethod: EOSE received for NIP-46 subscription');
                                if (active && observer.complete) {
                                    // observer.complete(); // NIP-46 typically long-lived, completion might not be standard.
                                }
                            },
                            onclose: (reason) => {
                                console.log('nostrSubscriptionMethod: SimplePool subscription closed for NIP-46, reason:', reason);
                                if (active && observer.error) {
                                     observer.error(new Error(`SimplePool NIP-46 subscription closed: ${reason}`));
                                }
                                active = false; 
                            }
                        }
                    );

                    return {
                        unsubscribe: () => {
                            if (active && subCloser) {
                                console.log('nostrSubscriptionMethod: Unsubscribing NIP-46 subscription from relays:', relays);
                                subCloser.close(); 
                                subCloser = null;
                                active = false;
                            }
                        },
                    };
                },
            };
        },
        [pool] // Depends on pool
    );

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
        if (!pool) {
            setNip46Error("Relay pool not available.");
            console.error("useNip46Auth: Relay pool not available.");
            setIsGeneratingUri(false);
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
            const localSecretKeyHex = bytesToHex(localSecretKeyBytes);

            const signerOpts: NostrConnectSignerOptions = {
                relays: RELAYS,
                signer: localSigner,
                subscriptionMethod: nostrSubscriptionMethod, // Use wrapper
                publishMethod: nostrPublishMethod,      // Use wrapper
            };
            const nip46Signer = new NostrConnectSigner(signerOpts);
            connectingNip46SignerRef.current = nip46Signer;

            const metadata: NostrConnectAppMetadata = {
                name: "Nostr TV App",
                url: window.location.origin,
            };
            const connectUri = nip46Signer.getNostrConnectURI(metadata);
            console.info("Generated NIP-46 Connect URI:", connectUri);
            setNip46ConnectUri(connectUri);

            console.info("Waiting for NIP-46 signer connection...");
            await nip46Signer.waitForSigner();
            console.info("NIP-46 connection successful!");

            const connectedSignerInstance = connectingNip46SignerRef.current;
            connectingNip46SignerRef.current = null;

            if (!connectedSignerInstance) {
                throw new Error("NIP-46 Signer instance lost after successful connection.");
            }

            const connectedUserPubkey = await connectedSignerInstance.getPublicKey();
            const remotePubkey = connectedSignerInstance.remote;

            if (!remotePubkey) {
                throw new Error("Connected, but remote pubkey is missing from signer instance.");
            }

            const sessionDataToSave: Omit<StoredNip46Data, 'id'> = {
                localSecret: localSecretKeyHex,
                remotePubkey: remotePubkey,
                connectedUserPubkey: connectedUserPubkey,
                relays: RELAYS,
            };
            await saveNip46DataToDb(sessionDataToSave);
            console.info("NIP-46 session persisted for user:", nip19.npubEncode(connectedUserPubkey));

            setNip46ConnectUri(null);
            setIsGeneratingUri(false);
            return connectedSignerInstance;

        } catch (error: any) {
            console.error("NIP-46 Connection initiation failed:", error);
            const message = `NIP-46 Connection failed: ${error.message || 'Unknown error'}`;
            await cleanupNip46Attempt(message);
            return null;
        } finally {
            if (connectingNip46SignerRef.current) {
                setIsGeneratingUri(false);
            }
        }
    }, [pool, cleanupNip46Attempt, nostrPublishMethod, nostrSubscriptionMethod]);

    const cancelNip46Connection = useCallback(() => {
        console.info("Cancelling NIP-46 connection attempt...");
        cleanupNip46Attempt("NIP-46 connection cancelled by user."); // Clean up with cancellation message
    }, [cleanupNip46Attempt]);

    const restoreNip46Session = useCallback(async (): Promise<NostrConnectSigner | null> => {
        if (!pool) {
            console.error("useNip46Auth: Relay pool not available during restore attempt.");
            return null;
        }
        setNip46Error(null);

        console.info("Attempting to restore NIP-46 session...");
        const persistedNip46 = await loadNip46DataFromDb();

        if (persistedNip46?.localSecret && persistedNip46?.remotePubkey && persistedNip46?.connectedUserPubkey) {
            try {
                const localSecretBytes = hexToBytes(persistedNip46.localSecret);
                const localSignerForRestore = new SimpleSigner(localSecretBytes);

                const signerOpts: NostrConnectSignerOptions = {
                    signer: localSignerForRestore,
                    remote: persistedNip46.remotePubkey,
                    pubkey: persistedNip46.connectedUserPubkey,
                    relays: persistedNip46.relays || RELAYS,
                    subscriptionMethod: nostrSubscriptionMethod, // Use wrapper
                    publishMethod: nostrPublishMethod,      // Use wrapper
                };
                const signer = new NostrConnectSigner(signerOpts);

                console.info("Attempting to connect restored NIP-46 signer...");
                await signer.connect();
                console.info("Restored NIP-46 signer connected successfully.");

                const connectedPubkey = await signer.getPublicKey();
                if (connectedPubkey === persistedNip46.connectedUserPubkey && signer.remote === persistedNip46.remotePubkey) {
                    console.info("NIP-46 session restored and verified for user:", nip19.npubEncode(persistedNip46.connectedUserPubkey));
                    return signer;
                } else {
                    console.error("Failed to restore NIP-46 session: Key mismatch after connect.", {
                        connectedUser: connectedPubkey, expectedUser: persistedNip46.connectedUserPubkey,
                        connectedRemote: signer.remote, expectedRemote: persistedNip46.remotePubkey
                    });
                    await clearNip46DataFromDb();
                    setNip46Error("NIP-46 session invalid (key mismatch). Please log in again.");
                    return null;
                }
            } catch (e: any) {
                console.error("Failed to connect restored NIP-46 session:", e);
                await clearNip46DataFromDb();
                setNip46Error(`Failed to restore NIP-46 session: ${e.message || 'Connection error'}. Please log in again.`);
                return null;
            }
        } else {
            console.info("No complete NIP-46 data found in storage for restore.");
            return null;
        }
    }, [pool, nostrPublishMethod, nostrSubscriptionMethod]);

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