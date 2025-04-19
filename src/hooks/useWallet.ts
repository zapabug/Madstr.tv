import { useState, useEffect, useCallback, useRef } from 'react';
import { Proof } from '@cashu/cashu-ts';
import { idb } from '../utils/idb'; // Use the consolidated idb export
import { cashuHelper } from '../utils/cashu';
import { UseAuthReturn } from './useAuth';
import NDK, { NDKEvent, NDKFilter, NDKSubscription, NDKUser, NostrEvent } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';

// <<< Define props for the hook >>>
interface UseWalletProps {
    ndkInstance: NDK | undefined;
    isNdkReady: boolean; // Flag indicating NDK connection status
}

// Define the shape of the wallet state and functions
export interface UseWalletReturn {
    proofs: (Proof & { mintUrl: string })[];
    balanceSats: number;
    isListeningForDeposits: boolean;
    walletError: string | null;
    isLoadingWallet: boolean;
    configuredMintUrl: string | null;
    // loadWalletState is now internal, triggered by NDK readiness
    startDepositListener: (auth: UseAuthReturn) => void; // NDK passed via props
    stopDepositListener: () => void;
    sendCashuTipWithSplits: (params: SendTipParams) => Promise<boolean>; // Returns true on success
    setConfiguredMintUrl: (url: string | null) => Promise<void>;
}

export interface SendTipParams {
    primaryRecipientNpub: string;
    amountSats: number;
    auth: UseAuthReturn;
    // ndk: NDK; // Removed, use ndkInstance from hook props
    // Optional fields for future use
    eventIdToZap?: string; // For potential Zap receipt
    comment?: string; // DM comment
    // zapsplitsConfig?: any; // For future complex splits
}

// NEW: List of default mints
const DEFAULT_MINT_URLS: string[] = [
    'https://mint.minibits.cash', // First entry is the initial default
    'https://mint.coinos.io',
    'https://mint.cashu.me',
    'https://testnut.cashu.space' // Test mint - Keep for internal use/testing
];

// Export the list for use elsewhere
export { DEFAULT_MINT_URLS };

// <<< Update hook signature to accept props >>>
export const useWallet = ({ ndkInstance, isNdkReady }: UseWalletProps): UseWalletReturn => {
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
        console.log('useWallet: Loading wallet state...');
        setIsLoadingWallet(true);
        setWalletError(null);
        try {
            const allProofs = await idb.getAllProofs();
            const currentBalance = cashuHelper.getProofsBalance(allProofs);
            const savedMintUrl = await idb.loadMintUrlFromDb();

            console.log('useWallet: Loaded proofs:', allProofs.length, 'Balance:', currentBalance, 'Mint URL:', savedMintUrl);

            if (isMountedRef.current) {
                setProofs(allProofs);
                setBalanceSats(currentBalance);
                // Use the first default URL if none saved
                _setConfiguredMintUrl(savedMintUrl ?? DEFAULT_MINT_URLS[0]);
            }
        } catch (error) {
            console.error('useWallet: Error loading wallet state:', error);
            if (isMountedRef.current) {
                setWalletError(`Failed to load wallet state: ${error instanceof Error ? error.message : String(error)}`);
            }
        } finally {
            if (isMountedRef.current) {
                setIsLoadingWallet(false);
            }
        }
    }, []);

    // <<< Effect to load wallet state when NDK becomes ready >>>
    useEffect(() => {
        if (isNdkReady) {
            console.log("useWallet: NDK is ready, triggering loadWalletState.");
            loadWalletState();
        } else {
            console.log("useWallet: NDK not ready, skipping initial wallet load.");
            // Optionally clear state if NDK becomes not ready?
            // setProofs([]);
            // setBalanceSats(0);
            // setIsLoadingWallet(true); 
        }
    }, [isNdkReady, loadWalletState]);

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
                // If URL is null or empty, remove it from DB and revert to default
                await idb.deleteSetting('mintUrl');
                _setConfiguredMintUrl(DEFAULT_MINT_URLS[0]); // Revert to the first default
                console.log('Cleared Mint URL setting, reverted to default.');
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

    // <<< Update startDepositListener signature and logic >>>
    const startDepositListener = useCallback((auth: UseAuthReturn) => {
        // <<< Check isNdkReady and ndkInstance from props >>>
        if (!isNdkReady || !ndkInstance) {
            console.warn('useWallet: Cannot start deposit listener: NDK not ready.');
            // Don't set wallet error here, App level should indicate NDK issues
            return;
        }
        if (!auth.isLoggedIn || !auth.currentUserNpub) {
            console.warn('useWallet: Cannot start deposit listener: User not logged in.');
            // setWalletError('Login required to listen for deposits.'); // Keep this?
            return;
        }
        if (depositSubRef.current) {
            console.log('useWallet: Deposit listener already running.');
            return;
        }

        console.log('useWallet: Starting deposit listener for pubkey:', auth.currentUserNpub);
        if (isMountedRef.current) {
            setIsListeningForDeposits(true);
            setWalletError(null);
        }

        const userHexPubkey = nip19.decode(auth.currentUserNpub).data as string;
        const filter: NDKFilter = { kinds: [4], '#p': [userHexPubkey], since: Math.floor(Date.now() / 1000) - 60 * 60 }; // Check last hour

        const handleIncomingDm = async (event: NDKEvent) => {
            if (!auth.decryptDm || !configuredMintUrl) {
                console.warn('Decryption function or mint URL not available.');
                return; 
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
                            const { proofs: redeemedProofs } = 
                                await cashuHelper.redeemToken(token);
                            
                            if (redeemedProofs && redeemedProofs.length > 0) {
                                console.log(`Successfully redeemed ${redeemedProofs.length} proofs from token.`);
                                await idb.addProofs(redeemedProofs, configuredMintUrl);
                                await loadWalletState(); // Reload state
                                setWalletError(null);
                            } else {
                                console.warn('Token redeemed but resulted in 0 proofs.');
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

        // <<< Use ndkInstance from props >>>
        depositSubRef.current = ndkInstance.subscribe(filter, { closeOnEose: false });
        depositSubRef.current.on('event', handleIncomingDm);
        depositSubRef.current.on('eose', () => console.log('useWallet: Deposit listener initial EOSE received.'));
        depositSubRef.current.on('close', (reason) => {
            console.log('useWallet: Deposit listener subscription closed:', reason);
            if (depositSubRef.current && isMountedRef.current) { // Avoid race conditions on unmount
                depositSubRef.current = null;
                setIsListeningForDeposits(false);
                // Optionally try to restart? Or indicate disconnected state?
                // setWalletError('Deposit listener disconnected.');
            }
        });

    // <<< Update dependencies for useCallback >>>
    }, [isNdkReady, ndkInstance, configuredMintUrl, loadWalletState]);

    // --- Tipping / Sending --- 

    // <<< Update sendCashuTipWithSplits to use ndkInstance from props >>>
    const sendCashuTipWithSplits = useCallback(async (params: SendTipParams): Promise<boolean> => {
        const { primaryRecipientNpub, amountSats, auth, comment, eventIdToZap } = params;

        if (!isNdkReady || !ndkInstance) {
            console.error('sendCashuTipWithSplits: NDK not ready.');
            setWalletError('Cannot send tip: Connection issue.');
            return false;
        }
        if (!configuredMintUrl) {
            console.error('sendCashuTipWithSplits: Mint URL not configured.');
            setWalletError('Cannot send tip: Mint URL not set.');
            return false;
        }
        if (!auth.isLoggedIn || !auth.currentUserNpub || !auth.encryptDm || !auth.signEvent) { // <<< Added signEvent check >>>
            console.error('sendCashuTipWithSplits: User not logged in or auth methods missing.');
            setWalletError('Login required to send tips.');
            return false;
        }

        console.log(`useWallet: Attempting to send ${amountSats} sats tip to ${primaryRecipientNpub}...`);
        setWalletError("Preparing tip...");
        let success = false;
        let proofsSpentInOp: Proof[] = []; // Track spent proofs

        try {
            // <<< Revert to createTokenForAmount logic >>>
            const proofsForMint = await idb.getProofsByMint(configuredMintUrl);
            if (cashuHelper.getProofsBalance(proofsForMint) < amountSats) {
                 throw new Error(`Insufficient balance at mint ${configuredMintUrl}. Need ${amountSats} sats.`);
            }

            // Use helper to get token and remaining proofs for THIS operation
            const { token: generatedToken, remainingProofs: remainingProofsAfterToken } = 
                await cashuHelper.createTokenForAmount(amountSats, proofsForMint, configuredMintUrl);
            
            // Determine which proofs were actually used for the token
            proofsSpentInOp = proofsForMint.filter(p => !remainingProofsAfterToken.some(rp => rp.secret === p.secret));
            console.log(`useWallet: Using ${proofsSpentInOp.length} proofs for token: ${generatedToken}`);

            // <<< Fix DM Event construction >>>
            const recipientHex = nip19.decode(primaryRecipientNpub).data as string;
            const dmContent = comment ? `${comment}\n\n${generatedToken}` : generatedToken;
            
            // 1. Encrypt the content first
            const encryptedDmContent = await auth.encryptDm(dmContent, recipientHex);
            if (!encryptedDmContent) { throw new Error('Failed to encrypt DM content'); }

            // 2. Create the NDKEvent structure
            const dmNdkEvent = new NDKEvent(ndkInstance); // Use NDK instance from props
            dmNdkEvent.kind = 4;
            dmNdkEvent.created_at = Math.floor(Date.now() / 1000);
            dmNdkEvent.tags = [['p', recipientHex]];
            dmNdkEvent.content = encryptedDmContent;
            
            // 3. Sign the event object (using auth hook's signer)
            // NDK's sign method uses the signer attached to the NDK instance
            // Ensure useAuth attaches the signer correctly to the ndkInstance
            await dmNdkEvent.sign(); // NDK handles getting signer
            
            // 4. Publish the signed event
            console.log('useWallet: Publishing encrypted & signed DM event...');
            await ndkInstance.publish(dmNdkEvent);
            console.log('useWallet: DM published successfully.');
            
            // TODO: Optional Zap Receipt (if eventIdToZap is provided)
            if (eventIdToZap) {
                console.warn("Zap receipt creation not yet implemented.");
            }

            // 5. Update local state: Remove spent proofs, add change proofs (if any - createToken handles change internally now)
            // We just need to save the *remaining* proofs from the operation
            const otherProofs = proofs.filter(p => !proofsForMint.some(pm => pm.secret === p.secret));
            const finalProofsSet = [...otherProofs, ...remainingProofsAfterToken];
            
            await idb.clearProofs(); // Clear old proofs
            // <<< Fix: Add mintUrl based on configuredMintUrl when mapping >>>
            const finalProofsWithMint = finalProofsSet.map((p: Proof) => ({ ...p, mintUrl: configuredMintUrl }));
            // <<< Revert: Pass configuredMintUrl to addProofs >>>
            await idb.addProofs(finalProofsWithMint, configuredMintUrl);

            if (isMountedRef.current) {
                setProofs(finalProofsWithMint); // Update state with final set
                setBalanceSats(cashuHelper.getProofsBalance(finalProofsWithMint));
                setWalletError(null); // Clear 'Preparing' message
                console.log('useWallet: Tip sent and wallet state updated.');
                success = true;
            }

        } catch (error) {
            console.error("useWallet: Error sending Cashu tip:", error);
            if (isMountedRef.current) {
                const message = error instanceof Error ? error.message : String(error);
                setWalletError(`Tip failed: ${message}`);
            }
            // Attempt to re-add spent proofs if send failed? Risky.
            success = false;
        } finally {
             if (isMountedRef.current) {
                 // Clear loading/error state appropriately
             }
        }
        return success;

    // <<< Fix dependencies: remove auth as it's passed in params >>>
    }, [proofs, configuredMintUrl, isNdkReady, ndkInstance, loadWalletState]);

    // --- Lifecycle --- 

    useEffect(() => {
        // Set mounted ref to true on mount
        isMountedRef.current = true;
        // Cleanup function runs on unmount
        return () => {
            isMountedRef.current = false;
            console.log('useWallet: Unmounting, stopping deposit listener.');
            stopDepositListener();
        };
    }, [stopDepositListener]);

    // Return the state and functions
    return {
        proofs,
        balanceSats,
        isListeningForDeposits,
        walletError,
        isLoadingWallet,
        configuredMintUrl,
        // loadWalletState, // Not exposed externally anymore
        startDepositListener,
        stopDepositListener,
        sendCashuTipWithSplits,
        setConfiguredMintUrl,
    };
};