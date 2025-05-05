import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Proof } from '@cashu/cashu-ts';
import { idb } from '../utils/idb'; // Use the consolidated idb export
import { cashuHelper } from '../utils/cashu';
import { UseAuthReturn, useAuth } from './useAuth';
import { nip19, Filter } from 'nostr-tools';
import { NostrEvent } from 'nostr-tools/pure'; // Keep NostrEvent from pure
import { Hooks } from 'applesauce-react';
import { QueryStore, EventStore } from 'applesauce-core';
import { Subscription } from 'rxjs'; // Import RxJS Subscription type
import { UnsignedEvent } from 'nostr-tools'; // Import UnsignedEvent

// Type alias for clarity within this file
type StoredProof = Proof & { mintUrl: string };

// Define minimal interface for required signer methods
interface EventSigner {
    pubkey: string;
    signEvent(event: Omit<NostrEvent, 'id' | 'sig'>): Promise<NostrEvent>;
}

// Define the shape of the wallet state and functions
export interface UseWalletReturn {
    proofs: StoredProof[]; // Use the alias
    balanceSats: number;
    isListeningForDeposits: boolean;
    walletError: string | null;
    isLoadingWallet: boolean;
    configuredMintUrl: string | null;
    loadWalletState: () => Promise<void>;
    startDepositListener: () => void;
    stopDepositListener: () => void;
    sendCashuTipWithSplits: (params: Omit<SendTipParams, 'ndk'>) => Promise<boolean>; // ndk removed from params type
    setConfiguredMintUrl: (url: string | null) => Promise<void>;
}

export interface SendTipParams {
    primaryRecipientNpub: string;
    amountSats: number;
    auth: UseAuthReturn;
    // Optional fields for future use
    eventIdToZap?: string; // For potential Zap receipt
    comment?: string; // DM comment
    // zapsplitsConfig?: any; // For future complex splits
}

const DEFAULT_MINT_URL = 'https://8333.space:3338'; // Example - Confirm this!

export const useWallet = (): UseWalletReturn => {
    // Get Applesauce Stores via specific hooks
    const queryStore = Hooks.useQueryStore();
    const eventStore = Hooks.useEventStore(); // Get EventStore
    // Get Auth state/methods internally
    const auth = useAuth();

    const [proofs, setProofs] = useState<StoredProof[]>([]); // Use alias
    const [balanceSats, setBalanceSats] = useState<number>(0);
    const [configuredMintUrl, _setConfiguredMintUrl] = useState<string | null>(null);
    const [isLoadingWallet, setIsLoadingWallet] = useState<boolean>(true);
    const [isListeningForDeposits, setIsListeningForDeposits] = useState<boolean>(false);
    const [walletError, setWalletError] = useState<string | null>(null);

    const depositSubscriptionRef = useRef<Subscription | null>(null); // Ref for RxJS subscription
    const isMountedRef = useRef(true); // Track component mount status
    const processingEventIdsRef = useRef<Set<string>>(new Set()); // Ref to track currently processing event IDs

    // --- Core State Management ---

    const loadWalletState = useCallback(async () => {
        console.log('useWallet: DIAGNOSTIC - Loading wallet state...'); // <-- DIAGNOSTIC LOG
        setIsLoadingWallet(true);
        setWalletError(null);
        try {
            // The return type of idb.getAllProofs() is now Promise<StoredProof[]>, so no flattening is needed.
            const allProofs: StoredProof[] = await idb.getAllProofs();

            const currentBalance = cashuHelper.getProofsBalance(allProofs);
            // Assumes idb.loadMintUrlFromDb() returns Promise<string | null>
            const savedMintUrl = await idb.loadMintUrlFromDb();

            console.log('useWallet: DIAGNOSTIC - Loaded proofs:', allProofs.length, 'Balance:', currentBalance, 'Mint URL:', savedMintUrl); // <-- DIAGNOSTIC LOG

            if (isMountedRef.current) {
                setProofs(allProofs);
                setBalanceSats(currentBalance);
                _setConfiguredMintUrl(savedMintUrl ?? DEFAULT_MINT_URL);
            }
        } catch (error) {
            console.error('Error loading wallet state:', error);
            if (isMountedRef.current) {
                setWalletError(`Failed to load wallet state: ${error instanceof Error ? error.message : String(error)}`);
            }
        } finally {
            if (isMountedRef.current) {
                setIsLoadingWallet(false);
            }
        }
    }, []);

    const setConfiguredMintUrl = useCallback(async (url: string | null) => {
        setWalletError(null);
        const urlToSave = url && url.trim() !== '' ? url.trim() : null;
        try {
            // Assumes idb.saveMintUrlToDb(url: string | null) returns Promise<void>
            await idb.saveMintUrlToDb(urlToSave);
            _setConfiguredMintUrl(urlToSave); // Update state
             if (urlToSave) {
                 console.log('Saved Mint URL:', urlToSave);
             } else {
                 console.log('Cleared Mint URL setting.');
             }
        } catch (error) {
            console.error('Error saving mint URL:', error);
            const message = error instanceof Error ? error.message : String(error);
            setWalletError(`Failed to save mint URL: ${message}`);
        }
    }, []);

    // --- Deposit Listener using useQuery ---

    // Memoize the filter to prevent unnecessary re-subscriptions if auth object is stable
    const depositFilter: Filter | null = useMemo(() => {
        if (!auth.isLoggedIn || !auth.currentUserNpub) {
            return null; // Don't subscribe if not logged in
        }
        const userHexPubkey = nip19.decode(auth.currentUserNpub).data as string;
        // Fetch DMs from the last hour initially, useQuery might handle updates
        return { kinds: [4], '#p': [userHexPubkey], since: Math.floor(Date.now() / 1000) - 3600 };
    }, [auth.isLoggedIn, auth.currentUserNpub]); // Dependencies for the filter

    // Callback to handle incoming DM events from manual subscription
    const handleIncomingDm = useCallback(async (event: NostrEvent) => {
        // Prevent processing if component is unmounted
        if (!isMountedRef.current) return;

        // Prevent re-processing the same event if callback fires multiple times rapidly
        if (processingEventIdsRef.current.has(event.id)) {
            console.log("useWallet: Already processing event:", event.id);
            return;
        }

        // Check dependencies needed for processing
        if (!auth.decryptDm || !configuredMintUrl) {
            console.warn('useWallet: Decryption function or mint URL not available. Skipping DM processing.');
            return; // Cannot process DMs
        }
        console.log('useWallet: Received potential deposit DM:', event.id);
        processingEventIdsRef.current.add(event.id); // Mark as processing

        try {
            const plaintext = await auth.decryptDm(event.pubkey, event.content);

            if (plaintext) {
                console.log('useWallet: Decrypted DM content: [REDACTED]');
                const tokenMatch = plaintext.match(/(cashuA[A-Za-z0-9_-]+)/);
                if (tokenMatch && tokenMatch[1]) {
                    const token = tokenMatch[1];
                    console.log('useWallet: Found Cashu token in DM:', token.substring(0, 10) + "...");
                     if (!isMountedRef.current) return; // Re-check mount status
                    setWalletError('Processing incoming deposit...');
                    let redeemedMintUrl: string | undefined = undefined;

                    try {
                        const { proofs: redeemedProofs, mintUrl: mintUrlFromToken } = await cashuHelper.redeemToken(token);
                        redeemedMintUrl = mintUrlFromToken;
                        if (redeemedProofs && redeemedProofs.length > 0) {
                            console.log(`useWallet: Successfully redeemed ${redeemedProofs.length} proofs from token (Mint: ${redeemedMintUrl}).`);
                            if (redeemedMintUrl) {
                                const finalMintUrl = redeemedMintUrl;
                                const proofsToSave: StoredProof[] = redeemedProofs.map(p => ({ ...p, mintUrl: finalMintUrl }));
                                await idb.saveProofs(proofsToSave);
                                console.log(`useWallet: Saved ${proofsToSave.length} new proofs via idb.saveProofs.`);
                                if (isMountedRef.current) {
                                    await loadWalletState();
                                    setWalletError(null);
                                }
                            } else {
                                console.error("useWallet: Redemption successful but mint URL missing.");
                                 if (isMountedRef.current) setWalletError("Failed to process deposit: Mint info missing.");
                            }
                        } else {
                            console.warn('useWallet: Token redeemed but resulted in 0 proofs.');
                        }
                    } catch (redeemError) {
                        console.error('useWallet: Error redeeming Cashu token:', redeemError);
                        const message = redeemError instanceof Error ? redeemError.message : String(redeemError);
                         if (isMountedRef.current) {
                             if (redeemedMintUrl && message.includes("Mint URL mismatch")) {
                                 setWalletError(`Cannot redeem token: It's from a different mint (${redeemedMintUrl}) than configured (${configuredMintUrl}).`);
                             } else if (message.includes("Token already spent") || message.includes("proofs already pending")) {
                                  console.warn("useWallet: Attempted to redeem already spent/pending token.");
                                  setWalletError(null);
                             } else {
                                 setWalletError(`Failed to redeem deposit: ${message}`);
                             }
                         }
                    } finally {
                         if (isMountedRef.current && walletError === 'Processing incoming deposit...') {
                             setWalletError(null);
                         }
                    }
                }
            } else {
                 console.log('useWallet: Failed to decrypt DM or plaintext was empty for event:', event.id);
            }
        } catch (decryptError) {
            console.error('useWallet: Error decrypting DM:', event.id, decryptError);
        } finally {
            // Ensure processing flag is removed even if errors occur
            processingEventIdsRef.current.delete(event.id);
        }
    }, [auth, configuredMintUrl, loadWalletState]); // Dependencies for the handler: Use internal auth

    // --- Manual Subscription Effect ---
    useEffect(() => {
        // Ensure stores and filter are ready
        if (!eventStore || !depositFilter) {
            // If already subscribed, unsubscribe
            if (depositSubscriptionRef.current) {
                console.log("useWallet: Cleaning up old deposit subscription (no filter/store).");
                depositSubscriptionRef.current.unsubscribe();
                depositSubscriptionRef.current = null;
                if (isMountedRef.current) setIsListeningForDeposits(false);
            }
            return; // Exit if not ready to subscribe
        }

        // Clean up previous subscription before starting a new one
        if (depositSubscriptionRef.current) {
            depositSubscriptionRef.current.unsubscribe();
        }

        console.log("useWallet: Subscribing to deposit DMs manually...");
        setWalletError(null);
        if (isMountedRef.current) setIsListeningForDeposits(true);

        // Subscribe using eventStore.filters
        const observable = eventStore.filters(depositFilter);
        depositSubscriptionRef.current = observable.subscribe({
            next: (event) => handleIncomingDm(event),
            error: (err) => {
                console.error("useWallet: Error in deposit DM subscription:", err);
                if (isMountedRef.current) {
                    setWalletError("Error listening for deposits.");
                    setIsListeningForDeposits(false);
                }
                depositSubscriptionRef.current = null; // Clear ref on error
            },
            // Optional: handle complete if the observable finishes?
            // complete: () => { ... }
        });

        // Cleanup function
        return () => {
            console.log("useWallet: Cleaning up deposit subscription effect.");
            if (depositSubscriptionRef.current) {
                depositSubscriptionRef.current.unsubscribe();
                depositSubscriptionRef.current = null;
            }
             if (isMountedRef.current) {
                 // Optionally set listening state to false on cleanup?
                 // setIsListeningForDeposits(false);
             }
        };

    }, [eventStore, depositFilter, handleIncomingDm]); // Dependencies: run when store, filter, or handler changes

    // Simplified Start/Stop functions - mostly for semantic purposes now
    const startDepositListener = useCallback(() => {
         console.log('useWallet: startDepositListener called (manual subscription handles lifecycle).');
         // Logic to manually trigger subscription is now within the useEffect based on depositFilter
         if (!auth.isLoggedIn && isMountedRef.current) {
            setWalletError('Login required to listen for deposits.');
         }
         return; // Explicitly return void
     }, [auth.isLoggedIn]);

     const stopDepositListener = useCallback(() => {
         console.log('useWallet: stopDepositListener called (manual subscription handles lifecycle).');
         // Logic to stop is handled by useEffect cleanup when depositFilter becomes null (logout)
         // Or by the cleanup when the component unmounts
         return; // Explicitly return void
     }, []);

    // --- Tipping Function ---

    const sendCashuTipWithSplits = useCallback(async (params: Omit<SendTipParams, 'ndk'>): Promise<boolean> => {
        const { primaryRecipientNpub, amountSats, auth: authParam } = params; // Use authParam from args here
        console.log(`useWallet: DIAGNOSTIC - sendCashuTipWithSplits called. Amount: ${amountSats}, Recipient: ${primaryRecipientNpub}`); // <-- DIAGNOSTIC LOG
        setWalletError(null); // Clear previous errors

        // Declare spentProofs here for wider scope
        let spentProofs: StoredProof[] = [];

        // 1. Checks
        // Use authParam from args, check eventStore instance, check for signer
        // ASSUMING authParam exposes activeSigner - cast to local interface
        const activeSigner = (authParam as any).activeSigner as EventSigner | undefined; // Use local EventSigner interface
        if (!authParam.isLoggedIn || !authParam.encryptDm || !eventStore || !activeSigner) {
            console.error('useWallet: DIAGNOSTIC - Tipping failed: User not logged in, encryptDm missing, EventStore missing, or no active signer.'); // <-- DIAGNOSTIC LOG
            setWalletError('Login, EventStore, and active Signer required for tipping.');
            return false;
        }
        if (!configuredMintUrl) {
            console.error('Tipping failed: Mint URL not configured.');
            setWalletError('Please configure a Cashu mint URL in Settings.');
            return false;
        }
        const currentBalance = cashuHelper.getProofsBalance(proofs);
        if (currentBalance < amountSats) {
            console.error('Tipping failed: Insufficient balance.');
            setWalletError(`Insufficient funds. Need ${amountSats}, have ${currentBalance}.`);
            return false;
        }

        console.log("useWallet: Preparing tip...");
        let recipientHexPubkey: string;
        try {
            recipientHexPubkey = nip19.decode(primaryRecipientNpub).data as string;
        } catch (e) {
            console.error("Invalid recipient npub:", primaryRecipientNpub, e);
            setWalletError("Invalid recipient address (npub).");
            return false;
        }

        let proofsToSend: StoredProof[] = [];
        let proofsToKeep: StoredProof[] = [];
        let serializedToken: string | null = null;

        try {
            // Split proofs based on configured mint URL
            const proofsForMint = proofs.filter(p => p.mintUrl === configuredMintUrl);
            const otherProofs = proofs.filter(p => p.mintUrl !== configuredMintUrl);

            if (cashuHelper.getProofsBalance(proofsForMint) < amountSats) {
                 console.error(`Insufficient balance for the configured mint (${configuredMintUrl}). Need ${amountSats}, have ${cashuHelper.getProofsBalance(proofsForMint)}.`);
                 setWalletError(`Insufficient funds for the configured mint (${configuredMintUrl}). Please check your proofs or deposit more.`);
                 return false;
            }

            // Use cashuHelper to create the token and handle change
            // TRYING: 3 arguments: amount, proofs, mintUrl
            const { token: cashuToken, remainingProofs } = await cashuHelper.createTokenForAmount(
                amountSats,
                proofsForMint, // Pass only proofs for the specific mint
                configuredMintUrl // Adding mintUrl back as 3rd arg
            );
            serializedToken = cashuToken; // Assign the returned token

            // Identify spent proofs by comparing proofsForMint with remainingProofs
            const remainingProofSecretsSet = new Set(remainingProofs.map((p: Proof) => p.secret)); // Add type to p
            // Assign to the higher-scoped spentProofs
            spentProofs = proofsForMint.filter((p: StoredProof) => !remainingProofSecretsSet.has(p.secret)); // Add type to p

            // Reconstruct proofsToKeep: other mints + remaining proofs from this mint
            proofsToKeep = [
                ...otherProofs,
                ...remainingProofs.map((p: Proof) => ({ ...p, mintUrl: configuredMintUrl })) // Add type to p, ensure mintUrl is added back
            ];

            console.log(`useWallet: DIAGNOSTIC - Token created: ${serializedToken ? serializedToken.substring(0, 10) + '...' : 'null'}, Spent proofs: ${spentProofs.length}, Remaining proofs (this mint): ${remainingProofs.length}`); // <-- DIAGNOSTIC LOG

        } catch (error) {
            console.error("Error creating Cashu token:", error);
            setWalletError(`Failed to prepare tip: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }

        if (!serializedToken) {
            console.error("Token creation resulted in null token.");
            setWalletError("Failed to create Cashu token.");
            return false;
        }

        console.log("useWallet: Preparing DM event...");
        try {
            const dmContent = params.comment
                ? `${params.comment}\n\n${serializedToken}`
                : `Nostr TV Tip!\n\n${serializedToken}`;

            const encryptedContent = await authParam.encryptDm(recipientHexPubkey, dmContent);

            if (!encryptedContent) {
                throw new Error("Encryption failed.");
            }

            const senderHexPubkey = authParam.currentUserNpub ? nip19.decode(authParam.currentUserNpub).data as string : null;
            if (!senderHexPubkey) {
                throw new Error("Could not determine sender pubkey.");
            }

            // Ensure activeSigner has signEvent method (runtime check added)
            if (typeof activeSigner.signEvent !== 'function') {
                throw new Error("Active signer does not support signEvent.");
            }

            const dmEvent: UnsignedEvent = {
                kind: 4,
                created_at: Math.floor(Date.now() / 1000),
                pubkey: senderHexPubkey,
                tags: [['p', recipientHexPubkey]],
                content: encryptedContent,
            };

             console.log("useWallet: DIAGNOSTIC - Signing DM event:", dmEvent); // <-- DIAGNOSTIC LOG

            // Sign the event using the active signer
            const signedDmEvent = await activeSigner.signEvent(dmEvent);

            console.log("useWallet: DIAGNOSTIC - Adding signed DM event to EventStore:", signedDmEvent.id); // <-- DIAGNOSTIC LOG

            // Add the signed event to the EventStore (assuming this triggers publishing)
            eventStore.add(signedDmEvent);

            // Assume success if add doesn't throw immediately
            // TODO: We might need a way to confirm relay publish status later
            const publishResult = { sent: true, id: signedDmEvent.id }; // Mock result for now

            if (publishResult?.sent) { // Check if publishResult indicates success
                console.log("useWallet: DIAGNOSTIC - DM event published successfully:", publishResult.id); // <-- DIAGNOSTIC LOG

                // 4. Update Local State (Only on successful publish)
                console.log("useWallet: Updating local wallet state after successful tip send.");
                 try {
                     // Delete the proofs that were spent
                     // Access higher-scoped spentProofs, add type to map parameter
                     const spentProofSecretsToDelete = spentProofs.map((p: StoredProof) => p.secret);
                     await idb.deleteProofsBySecret(spentProofSecretsToDelete);
                     console.log(`Deleted ${spentProofSecretsToDelete.length} spent proofs via idb.deleteProofsBySecret.`);

                     // Update component state
                     if (isMountedRef.current) {
                         setProofs(proofsToKeep);
                         setBalanceSats(cashuHelper.getProofsBalance(proofsToKeep));
                         console.log("useWallet: Local state updated. New balance:", cashuHelper.getProofsBalance(proofsToKeep));
                     }
                     return true;
                 } catch (dbError) {
                     console.error("CRITICAL: Failed to update local proofs DB after successful send!", dbError);
                     setWalletError("Tip sent, but failed to update local wallet! Balance may be incorrect. Please refresh.");
                     return false;
                 }
             }
             // If add succeeded (didn't throw), assume publish initiated. Error is handled below.

        } catch (error) {
            console.error("Error sending tip DM:", error);
            setWalletError(`Failed to send tip: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
    }, [proofs, configuredMintUrl, loadWalletState, eventStore, queryStore]); // Keep dependencies

    // --- Lifecycle Effect ---

    useEffect(() => {
        isMountedRef.current = true;
        loadWalletState(); // Load initial state on mount

        return () => {
            isMountedRef.current = false;
            // The manual subscription cleanup is handled by its own useEffect return function
            console.log("useWallet: Unmounted.");
        };
    }, [loadWalletState]);


    return {
        proofs,
        balanceSats,
        isListeningForDeposits,
        walletError,
        isLoadingWallet,
        configuredMintUrl,
        loadWalletState,
        startDepositListener,
        stopDepositListener,
        sendCashuTipWithSplits,
        setConfiguredMintUrl,
    };
};