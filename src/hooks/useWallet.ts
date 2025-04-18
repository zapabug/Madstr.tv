import { useState, useEffect, useCallback, useRef } from 'react';
import { Proof } from '@cashu/cashu-ts';
import { idb } from '../utils/idb'; // Use the consolidated idb export
import { cashuHelper } from '../utils/cashu';
import { UseAuthReturn } from './useAuth';
import NDK, { NDKEvent, NDKFilter, NDKSubscription, NDKUser, NostrEvent } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';

// Define the shape of the wallet state and functions
export interface UseWalletReturn {
    proofs: (Proof & { mintUrl: string })[];
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
    const [proofs, setProofs] = useState<(Proof & { mintUrl: string })[]>([]);
    const [balanceSats, setBalanceSats] = useState<number>(0);
    const [configuredMintUrl, _setConfiguredMintUrl] = useState<string | null>(null);
    const [isLoadingWallet, setIsLoadingWallet] = useState<boolean>(true);
    const [isListeningForDeposits, setIsListeningForDeposits] = useState<boolean>(false);
    const [walletError, setWalletError] = useState<string | null>(null);

    const depositSubRef = useRef<NDKSubscription | null>(null);
    const isMountedRef = useRef(true); // Track component mount status

    // --- Core State Management ---

    const loadWalletState = useCallback(async () => {
        console.log('Loading wallet state...');
        setIsLoadingWallet(true);
        setWalletError(null);
        try {
            const allProofs = await idb.getAllProofs();
            const currentBalance = cashuHelper.getProofsBalance(allProofs);
            const savedMintUrl = await idb.loadMintUrlFromDb();

            console.log('Loaded proofs:', allProofs.length, 'Balance:', currentBalance, 'Mint URL:', savedMintUrl);

            if (isMountedRef.current) {
                setProofs(allProofs);
                setBalanceSats(currentBalance);
                _setConfiguredMintUrl(savedMintUrl ?? DEFAULT_MINT_URL); // Use default if none saved
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
            if (urlToSave) {
                // Validate URL format before saving
                new URL(urlToSave);
                await idb.saveMintUrlToDb(urlToSave);
                _setConfiguredMintUrl(urlToSave);
                 console.log('Saved Mint URL:', urlToSave);
            } else {
                // If URL is null or empty, remove it from DB and maybe revert to default?
                // For now, just save null/empty as null in state and remove from DB
                 await idb.deleteSetting('mintUrl'); // Assuming idb.deleteSetting handles the key 'mintUrl'
                _setConfiguredMintUrl(null);
                 console.log('Cleared Mint URL setting.');
                 // Consider setting a default here or prompting user
                 // _setConfiguredMintUrl(DEFAULT_MINT_URL); 
            }
        } catch (error) {
            console.error('Error saving mint URL:', error);
            const message = error instanceof Error ? error.message : String(error);
            setWalletError(`Failed to save mint URL: ${message}`);
            // Optionally re-throw or handle differently
        }
    }, []);

    // --- Deposit Listener --- 

    const stopDepositListener = useCallback(() => {
        if (depositSubRef.current) {
            console.log('Stopping deposit listener...');
            depositSubRef.current.stop();
            depositSubRef.current = null;
             if (isMountedRef.current) {
                 setIsListeningForDeposits(false);
             }
        }
    }, []);

    const startDepositListener = useCallback((auth: UseAuthReturn, ndk: NDK) => {
        if (!auth.isLoggedIn || !auth.currentUserNpub || !ndk) {
            console.warn('Cannot start deposit listener: User not logged in or NDK not available.');
            setWalletError('Login required to listen for deposits.');
            return;
        }
        if (depositSubRef.current) {
            console.log('Deposit listener already running.');
            return;
        }

        console.log('Starting deposit listener for pubkey:', auth.currentUserNpub);
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
                const plaintext = await auth.decryptDm(event.content, event.pubkey);

                if (plaintext) {
                    console.log('Decrypted DM content:', plaintext); // Careful logging plaintext
                    const tokenMatch = plaintext.match(/(cashuA[A-Za-z0-9_-]+)/);
                    if (tokenMatch && tokenMatch[1]) {
                        const token = tokenMatch[1];
                        console.log('Found Cashu token in DM:', token);
                        setWalletError('Processing incoming deposit...'); // Indicate activity

                        try {
                            // Use the configured mint URL for redeeming
                            const { proofs: redeemedProofs } = await cashuHelper.redeemToken(token, configuredMintUrl);
                            if (redeemedProofs && redeemedProofs.length > 0) {
                                console.log(`Successfully redeemed ${redeemedProofs.length} proofs from token.`);
                                await idb.addProofs(redeemedProofs, configuredMintUrl); // Store with correct mint
                                // Reload state to reflect new balance and proofs
                                await loadWalletState();
                                setWalletError(null); // Clear processing message
                                // TODO: Maybe send an ack DM back?
                            } else {
                                console.warn('Token redeemed but resulted in 0 proofs.');
                                // setWalletError('Deposit token was empty or already spent.');
                            }
                        } catch (redeemError) {
                            console.error('Error redeeming Cashu token:', redeemError);
                            const message = redeemError instanceof Error ? redeemError.message : String(redeemError);
                             if (isMountedRef.current) {
                                 setWalletError(`Failed to redeem deposit: ${message}`);
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

    }, [configuredMintUrl, loadWalletState]); // Dependencies: configuredMintUrl, loadWalletState

    // --- Tipping Function ---

    const sendCashuTipWithSplits = useCallback(async (params: SendTipParams): Promise<boolean> => {
        const { primaryRecipientNpub, amountSats, auth, ndk } = params;
        console.log(`Initiating tip: ${amountSats} sats to ${primaryRecipientNpub}`);
        setWalletError(null); // Clear previous errors

        // 1. Checks
        if (!auth.isLoggedIn || !auth.encryptDm || !auth.signEvent) {
            console.error('Tipping failed: User not logged in or auth methods missing.');
            setWalletError('Login required for tipping.');
            return false;
        }
        if (!configuredMintUrl) {
            console.error('Tipping failed: Mint URL not configured.');
            setWalletError('Please configure a Cashu mint URL in Settings.');
            return false;
        }
        if (balanceSats < amountSats) {
            console.error('Tipping failed: Insufficient balance.');
            setWalletError(`Insufficient funds. Need ${amountSats}, have ${balanceSats}.`);
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
            // 3. Get Proofs for the specific mint
            const proofsForMint = await idb.getProofsByMint(configuredMintUrl);
            if (cashuHelper.getProofsBalance(proofsForMint) < amountSats) {
                throw new Error(`Insufficient balance at mint ${configuredMintUrl}.`);
            }

            // 4. Generate & Send Loop (Simplified to one recipient)
            for (const recipient of recipients) {
                console.log(`Creating token for ${recipient.amount} sats for pubkey ${recipient.pubkey}`);

                // Use helper to create token, it should handle selecting/spending proofs
                const { token: generatedToken, remainingProofs: remainingProofsForOp } =
                    await cashuHelper.createTokenForAmount(proofsForMint, recipient.amount, configuredMintUrl);

                console.log('Generated token:', generatedToken);
                spentProofs = proofsForMint.filter(p => !remainingProofsForOp.some(rp => rp.secret === p.secret)); // Calculate spent

                // Construct DM
                const dmPlaintext = params.comment
                    ? `Sent ${recipient.amount} sats. ${params.comment} ${generatedToken}`
                    : `Sent ${recipient.amount} sats. ${generatedToken}`;

                // Encrypt DM
                const encryptedContent = await auth.encryptDm(dmPlaintext, recipient.pubkey);
                if (!encryptedContent) {
                    throw new Error('Failed to encrypt DM content.');
                }

                // Create & Sign DM Event
                const dmEvent = new NDKEvent(ndk);
                dmEvent.kind = 4;
                dmEvent.created_at = Math.floor(Date.now() / 1000);
                dmEvent.tags = [['p', recipient.pubkey]];
                dmEvent.content = encryptedContent;

                // Sign the event object
                const signedEventData: NostrEvent | null = await auth.signEvent(dmEvent);
                if (!signedEventData) {
                    throw new Error('Failed to sign DM event.');
                }

                // Publish DM
                console.log('Publishing tip DM event...');
                // Create a new NDKEvent from the signed data to publish
                const eventToPublish = new NDKEvent(ndk, signedEventData);
                await eventToPublish.publish();
                console.log('Tip DM published successfully.');

                // If successful, mark operation as success
                success = true;
            }

            // 5. Update State (only if successful)
            if (success) {
                 console.log('Removing spent proofs:', spentProofs.length);
                await idb.removeProofs(spentProofs);
                await loadWalletState(); // Reload to update balance/proofs list
                setWalletError(null); // Clear processing message
            }

        } catch (error) {
            console.error('Error during tipping process:', error);
            const message = error instanceof Error ? error.message : String(error);
            setWalletError(`Tip failed: ${message}`);
            success = false; // Ensure failure is marked
            // Note: If token creation succeeded but DM failed, proofs might be locked/lost
            // More robust handling might try to re-add remaining proofs or store spent ones temporarily
        } finally {
             if (isMountedRef.current) {
                 setIsLoadingWallet(false); // Stop loading indicator
                 if (!success && !walletError) {
                     setWalletError('Tip failed due to an unknown error.');
                 }
             }
        }

        return success;
    }, [balanceSats, configuredMintUrl, loadWalletState]);

    // --- Effects --- 

    // Load initial state on mount
    useEffect(() => {
        isMountedRef.current = true;
        loadWalletState();
        // Cleanup ref on unmount
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