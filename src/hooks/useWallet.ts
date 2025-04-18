import { useState, useEffect, useCallback, useRef } from 'react';
import { Proof } from '@cashu/cashu-ts';
import { idb } from '../utils/idb'; // Use the consolidated idb export
import { cashuHelper } from '../utils/cashu';
import { UseAuthReturn } from './useAuth';
import NDK, { NDKEvent, NDKFilter, NDKSubscription, NDKUser, NostrEvent } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';

// Type alias for clarity within this file
type StoredProof = Proof & { mintUrl: string };

// Define the shape of the wallet state and functions
export interface UseWalletReturn {
    proofs: StoredProof[]; // Use the alias
    balanceSats: number;
    isListeningForDeposits: boolean;
    walletError: string | null;
    isLoadingWallet: boolean;
    configuredMintUrl: string | null;
    loadWalletState: () => Promise<void>;
    startDepositListener: (auth: UseAuthReturn, ndk: NDK) => void;
    stopDepositListener: () => void;
    sendCashuTipWithSplits: (params: SendTipParams) => Promise<boolean>; // Returns true on success
    setConfiguredMintUrl: (url: string | null) => Promise<void>;
}

export interface SendTipParams {
    primaryRecipientNpub: string;
    amountSats: number;
    auth: UseAuthReturn;
    ndk: NDK;
    // Optional fields for future use
    eventIdToZap?: string; // For potential Zap receipt
    comment?: string; // DM comment
    // zapsplitsConfig?: any; // For future complex splits
}

const DEFAULT_MINT_URL = 'https://8333.space:3338'; // Example - Confirm this!

export const useWallet = (): UseWalletReturn => {
    const [proofs, setProofs] = useState<StoredProof[]>([]); // Use alias
    const [balanceSats, setBalanceSats] = useState<number>(0);
    const [configuredMintUrl, _setConfiguredMintUrl] = useState<string | null>(null);
    const [isLoadingWallet, setIsLoadingWallet] = useState<boolean>(true);
    const [isListeningForDeposits, setIsListeningForDeposits] = useState<boolean>(false);
    const [walletError, setWalletError] = useState<string | null>(null);

    const depositSubRef = useRef<NDKSubscription | null>(null);
    const isMountedRef = useRef(true); // Track component mount status

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

    // --- Deposit Listener --- 

    const stopDepositListener = useCallback(() => {
        if (depositSubRef.current) {
            console.log('useWallet: DIAGNOSTIC - Stopping deposit listener...'); // <-- DIAGNOSTIC LOG
            depositSubRef.current.stop();
            depositSubRef.current = null;
             if (isMountedRef.current) {
                 setIsListeningForDeposits(false);
             }
        }
    }, []);

    const startDepositListener = useCallback((auth: UseAuthReturn, ndk: NDK) => {
        console.log('useWallet: DIAGNOSTIC - startDepositListener called.'); // <-- DIAGNOSTIC LOG
        if (!auth.isLoggedIn || !auth.currentUserNpub || !ndk) {
            console.warn('useWallet: DIAGNOSTIC - Cannot start deposit listener: User not logged in or NDK not available.'); // <-- DIAGNOSTIC LOG
            setWalletError('Login required to listen for deposits.');
            return;
        }
        if (depositSubRef.current) {
            console.log('useWallet: DIAGNOSTIC - Deposit listener already running.'); // <-- DIAGNOSTIC LOG
            return;
        }

        console.log('useWallet: DIAGNOSTIC - Starting deposit listener for pubkey:', auth.currentUserNpub); // <-- DIAGNOSTIC LOG
         if (isMountedRef.current) {
             setIsListeningForDeposits(true);
             setWalletError(null);
         }

        const userHexPubkey = nip19.decode(auth.currentUserNpub).data as string;
        const filter: NDKFilter = { kinds: [4], '#p': [userHexPubkey], since: Math.floor(Date.now() / 1000) - 60 * 60 }; // Check last hour

        const handleIncomingDm = async (event: NDKEvent) => {
            if (!auth.decryptDm || !configuredMintUrl) {
                console.warn('Decryption function or mint URL not available.');
                return; // Cannot process DMs
            }
            console.log('Received potential deposit DM:', event.id);

            try {
                const plaintext = await auth.decryptDm(event.pubkey, event.content);

                if (plaintext) {
                    console.log('Decrypted DM content:', plaintext); // Careful logging plaintext
                    const tokenMatch = plaintext.match(/(cashuA[A-Za-z0-9_-]+)/);
                    if (tokenMatch && tokenMatch[1]) {
                        const token = tokenMatch[1];
                        console.log('Found Cashu token in DM:', token);
                        setWalletError('Processing incoming deposit...'); // Indicate activity
                        let redeemedMintUrl: string | undefined = undefined; // Declare outside try

                        try {
                            // Assumes cashuHelper.redeemToken takes only the token string
                            const { proofs: redeemedProofs, mintUrl: mintUrlFromToken } = await cashuHelper.redeemToken(token);
                            redeemedMintUrl = mintUrlFromToken; // Assign inside try
                            if (redeemedProofs && redeemedProofs.length > 0) {
                                console.log(`Successfully redeemed ${redeemedProofs.length} proofs from token (Mint: ${redeemedMintUrl}).`);
                                // Ensure redeemedMintUrl is defined before saving
                                if (redeemedMintUrl) {
                                    // Assign to a new const inside the block to help TS narrow the type
                                    const finalMintUrl = redeemedMintUrl;
                                    const proofsToSave: StoredProof[] = redeemedProofs.map(p => ({ ...p, mintUrl: finalMintUrl }));

                                    await idb.saveProofs(proofsToSave);
                                    console.log(`Saved ${proofsToSave.length} new proofs via idb.saveProofs.`);

                                    // Reload state to reflect new balance and proofs
                                    await loadWalletState();
                                    setWalletError(null); // Clear processing message
                                    // TODO: Maybe send an ack DM back?
                                } else {
                                    console.error("Redemption successful but mint URL was missing from response. Cannot save proofs.");
                                    setWalletError("Failed to process deposit: Mint information missing.");
                                }
                            } else {
                                console.warn('Token redeemed but resulted in 0 proofs.');
                                // setWalletError('Deposit token was empty or already spent.');
                            }
                        } catch (redeemError) {
                            console.error('Error redeeming Cashu token:', redeemError);
                            const message = redeemError instanceof Error ? redeemError.message : String(redeemError);
                             if (isMountedRef.current) {
                                 // Display a more specific error if the mint doesn't match
                                 // Check redeemedMintUrl existence before using it
                                 if (redeemedMintUrl && message.includes("Mint URL mismatch")) {
                                     setWalletError(`Cannot redeem token: It's from a different mint (${redeemedMintUrl}) than configured (${configuredMintUrl}).`);
                                 } else {
                                     setWalletError(`Failed to redeem deposit: ${message}`);
                                 }
                             }
                        }
                    }
                } else {
                     console.log('Failed to decrypt DM or plaintext was empty.');
                }
            } catch (decryptError) {
                console.error('Error decrypting DM:', decryptError);
                // Don't show decryption errors usually, could be spam or unrelated DMs
            }
        };

        depositSubRef.current = ndk.subscribe(filter, { closeOnEose: false });
        depositSubRef.current.on('event', handleIncomingDm);
        depositSubRef.current.on('eose', () => console.log('Deposit listener initial EOSE received.'));
        depositSubRef.current.on('close', (reason) => {
            console.log('Deposit listener subscription closed:', reason);
            if (depositSubRef.current && isMountedRef.current) { // Avoid race conditions on unmount
                 depositSubRef.current = null;
                 setIsListeningForDeposits(false);
                 // Optionally try to restart? Or indicate disconnected state?
                 // setWalletError('Deposit listener disconnected.');
            }
        });

    }, [configuredMintUrl, loadWalletState]); // Removed auth, ndk from dependencies

    // --- Tipping Function ---

    const sendCashuTipWithSplits = useCallback(async (params: SendTipParams): Promise<boolean> => {
        const { primaryRecipientNpub, amountSats, auth, ndk } = params;
        console.log(`useWallet: DIAGNOSTIC - sendCashuTipWithSplits called. Amount: ${amountSats}, Recipient: ${primaryRecipientNpub}`); // <-- DIAGNOSTIC LOG
        setWalletError(null); // Clear previous errors

        // 1. Checks
        // Removed signEvent check as it's implicit in ndk.publish
        if (!auth.isLoggedIn || !auth.encryptDm) {
            console.error('useWallet: DIAGNOSTIC - Tipping failed: User not logged in or encryptDm missing.'); // <-- DIAGNOSTIC LOG
            setWalletError('Login required for tipping.');
            return false;
        }
        if (!ndk) { // Check ndk from params
             console.error('useWallet: DIAGNOSTIC - Tipping failed: NDK instance not provided.');
             setWalletError('NDK instance required for tipping.');
             return false;
        }
        if (!configuredMintUrl) {
            console.error('Tipping failed: Mint URL not configured.');
            setWalletError('Please configure a Cashu mint URL in Settings.');
            return false;
        }
        // Use cashuHelper to calculate balance from current proofs state
        if (cashuHelper.getProofsBalance(proofs) < amountSats) {
            console.error('Tipping failed: Insufficient balance.');
            setWalletError(`Insufficient funds. Need ${amountSats}, have ${cashuHelper.getProofsBalance(proofs)}.`);
            return false;
        }
        if (!primaryRecipientNpub) {
            console.error('Tipping failed: No recipient specified.');
            setWalletError('Cannot tip: Recipient not found.');
            return false;
        }

        let recipientHexPubkey: string;
        try {
             recipientHexPubkey = nip19.decode(primaryRecipientNpub).data as string;
             if (!recipientHexPubkey) throw new Error('Invalid recipient npub format');
        } catch (e) {
            console.error('Tipping failed: Invalid recipient npub:', primaryRecipientNpub, e);
            setWalletError('Invalid recipient identifier.');
            return false;
        }

        // Simplified: 100% to primary recipient
        const recipients = [{ pubkey: recipientHexPubkey, amount: amountSats }];
        // TODO: Implement Zapsplit profile parsing later

        setIsLoadingWallet(true); // Use loading state for tip processing
        setWalletError('Processing tip...');
        let success = false;
        let spentProofs: Proof[] = []; // Track proofs spent in this operation

        try {
            // Filter available proofs for the specific mint
            const proofsForMint = proofs.filter(p => p.mintUrl === configuredMintUrl);

            // 2. Create Cashu Token
            const { token: cashuToken, remainingProofs: proofsLeftInMint } = await cashuHelper.createTokenForAmount(
                amountSats,
                proofsForMint, // Only pass proofs for the relevant mint
                configuredMintUrl
            );

            // Track the proofs that were consumed by createTokenForAmount
            const spentProofSecretsSet = new Set(proofsLeftInMint.map(p => p.secret));
            spentProofs = proofsForMint.filter(p => !spentProofSecretsSet.has(p.secret));

            // 3. Prepare Nostr DM Event
            const dmContent = `Here is your ${amountSats} sat tip!\n\n${cashuToken}\n\nSent from Madstr.tv`;
            const encryptedContent = await auth.encryptDm(recipientHexPubkey, dmContent);

            const dmEvent = new NDKEvent(ndk);
            dmEvent.kind = 4;
            dmEvent.created_at = Math.floor(Date.now() / 1000);
            dmEvent.content = encryptedContent;
            dmEvent.tags = [['p', recipientHexPubkey]];
            // Optional: Add tags related to the original event being tipped (for Zap Receipts later)
            if (params.eventIdToZap) {
                dmEvent.tags.push(['e', params.eventIdToZap]);
            }

            // 4. Publish DM Event (Implicitly signs)
            console.log('Publishing tip DM...', dmEvent.rawEvent());
            await dmEvent.publish(); // Use NDK's publish, no explicit sign needed
            console.log('Tip DM published successfully.');

            // 5. Update local wallet state (remove spent proofs)
            const spentProofSecretsToDelete = spentProofs.map(p => p.secret);
            
            // Use the new helper functions
            // Assumes idb.deleteProofsBySecret exists on idb
            await idb.deleteProofsBySecret(spentProofSecretsToDelete);
            console.log(`Deleted ${spentProofSecretsToDelete.length} spent proofs via idb.deleteProofsBySecret.`);

            // Update local state immediately for responsiveness
            // Combine remaining proofs for this mint with proofs from other mints
            const otherMintProofs = proofs.filter(p => p.mintUrl !== configuredMintUrl);
            const finalProofsState: StoredProof[] = [
                 ...otherMintProofs,
                 ...proofsLeftInMint.map(p => ({ ...p, mintUrl: configuredMintUrl })) // Ensure mintUrl is included
            ];

            if (isMountedRef.current) {
                 setProofs(finalProofsState);
                 setBalanceSats(cashuHelper.getProofsBalance(finalProofsState));
                 setWalletError(null); // Clear processing message
            }
            success = true;

        } catch (error) {
            console.error('Error during tipping process:', error);
            const message = error instanceof Error ? error.message : String(error);
            if (isMountedRef.current) {
                setWalletError(`Tipping failed: ${message}`);
            }
            // Optional: Try to add back any proofs that might have been removed optimistically if needed
        } finally {
            if (isMountedRef.current) {
                setIsLoadingWallet(false);
            }
        }
        return success;
    }, [proofs, configuredMintUrl, loadWalletState]); // Corrected dependency array: Only include variables from the outer scope that the callback depends on.
    // auth and ndk are passed via params, so they shouldn't be in the deps array.

    // --- Initial Load --- 
    useEffect(() => {
        isMountedRef.current = true;
        loadWalletState();

        // Cleanup on unmount
        return () => {
            isMountedRef.current = false;
            stopDepositListener(); // Ensure listener is stopped on unmount
        };
    }, [loadWalletState, stopDepositListener]); // Add stopDepositListener

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