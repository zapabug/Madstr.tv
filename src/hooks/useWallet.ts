import 'websocket-polyfill';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Proof } from '@cashu/cashu-ts';
import { idb } from '../utils/idb'; // Use the consolidated idb export
import { cashuHelper } from '../utils/cashu';
import { UseAuthReturn } from './useAuth';
import { NDKEvent, NDKFilter, NDKSubscription } from '@nostr-dev-kit/ndk'; // <<< RE-ADDED NDK type imports
import { useNdk } from 'nostr-hooks'; // <<< Corrected import path and hook name
import { nip19 } from 'nostr-tools';
// import { useAuth } from './useAuth'; // <<< REMOVED unused useAuth import
// import { CashuMint, CashuWallet, /* PayLnInvoiceResponse, */ SendResponse, TokenV2 as TokenV3 } from '@cashu/cashu-ts'; // <<< REMOVED unused import
// import { RELAYS } from '../constants'; // <<< REMOVED unused RELAYS import

// Define the shape of the wallet state and functions
export interface UseWalletReturn {
    proofs: (Proof & { mintUrl: string })[];
    balanceSats: number;
    isListeningForDeposits: boolean;
    walletError: string | null;
    isLoadingWallet: boolean;
    configuredMintUrl: string | null;
    // loadWalletState is now internal, triggered by NDK readiness
    startDepositListener: (isLoggedIn: boolean, currentUserNpub: string | null, decryptDm: (senderPubkeyHex: string, ciphertext: string) => Promise<string>) => void; // NDK passed via props
    stopDepositListener: () => Promise<void>; // <<< Mark as async
    sendCashuTipWithSplits: (params: SendTipParams) => Promise<boolean>; // Returns true on success
    setConfiguredMintUrl: (url: string | null) => Promise<void>;
    exportUnspentProofs: () => Promise<string | null>;
}

// <<< Restore definition >>>
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
    'https://testnut.cashu.space', // Test mint first for default
    'https://mint.minibits.cash',
    'https://mint.coinos.io',
    'https://mint.npub.cash' // Added npub.cash
    // 'https://mint.cashu.me', // Removed cashu.me
];

// Export the list for use elsewhere
export { DEFAULT_MINT_URLS };

// <<< Update hook signature to remove props >>>
// export const useWallet = ({ ndkInstance, isNdkReady }: UseWalletProps): UseWalletReturn => {
export const useWallet = (): UseWalletReturn => {
    const { ndk } = useNdk(); // <<< Get NDK instance via hook
    // const { currentUserNpub, getNdkSigner } = useAuth(); // <<< REMOVED - Not used directly in this hook

    const [proofs, setProofs] = useState<(Proof & { mintUrl: string })[]>([]);
    const [balanceSats, setBalanceSats] = useState<number>(0);
    const [configuredMintUrl, _setConfiguredMintUrl] = useState<string | null>(null);
    const [isLoadingWallet, setIsLoadingWallet] = useState<boolean>(true);
    const [isListeningForDeposits, setIsListeningForDeposits] = useState<boolean>(false);
    const [walletError, setWalletError] = useState<string | null>(null);

    const depositSubRef = useRef<NDKSubscription | null>(null);
    const isMountedRef = useRef(true); // Track component mount status
    // <<< Ref to store the last checked timestamp >>>
    const lastCheckedTimestampRef = useRef<number | null>(null);

    // --- Core State Management ---

    const loadWalletState = useCallback(async () => {
        console.log('useWallet: Loading wallet state...');
        setIsLoadingWallet(true);
        setWalletError(null);
        try {
            const allProofs = await idb.getAllProofs();
            const currentBalance = cashuHelper.getProofsBalance(allProofs);
            const savedMintUrl = await idb.loadMintUrlFromDb();
            // <<< Load the timestamp >>>
            const lastTimestamp = await idb.loadLastCheckedDmTimestamp();

            console.log('useWallet: Loaded proofs:', allProofs.length, 'Balance:', currentBalance, 'Mint URL:', savedMintUrl, 'Last Check:', lastTimestamp);

            if (isMountedRef.current) {
                setProofs(allProofs);
                setBalanceSats(currentBalance);
                // Use the first default URL if none saved
                _setConfiguredMintUrl(savedMintUrl ?? DEFAULT_MINT_URLS[0]);
                // <<< Store timestamp in ref >>>
                lastCheckedTimestampRef.current = lastTimestamp;
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
        if (ndk) {
            console.log("useWallet: NDK is ready, triggering loadWalletState.");
            loadWalletState();
        }
    }, [ndk, loadWalletState]);

    const setConfiguredMintUrl = useCallback(async (url: string | null) => {
        setWalletError(null);
        const urlToSave = url && url.trim() !== '' ? url.trim() : null;
        try {
            if (urlToSave) {
                // Validate URL format before saving
                new URL(urlToSave);
                await idb.saveMintUrlToDb(urlToSave);
                _setConfiguredMintUrl(urlToSave);
                 console.log('Saved Mint URLcash:', urlToSave);
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

    const stopDepositListener = useCallback(async () => { // <<< Make async >>>
        if (depositSubRef.current) {
            console.log('Stopping deposit listener...');
            depositSubRef.current.stop();
            depositSubRef.current = null;
             if (isMountedRef.current) {
                 setIsListeningForDeposits(false);
             }
            // <<< Save timestamp when stopping >>>
            try {
                const nowTimestamp = Math.floor(Date.now() / 1000);
                await idb.saveLastCheckedDmTimestamp(nowTimestamp);
                lastCheckedTimestampRef.current = nowTimestamp; // Update ref immediately
                console.log(`useWallet: Saved last checked timestamp: ${nowTimestamp}`);
            } catch (error) {
                console.error('useWallet: Failed to save last checked timestamp:', error);
                // Handle error? Maybe set an error state?
            }
        }
    }, []); // No dependencies needed here as it uses refs and idb

    // <<< Update startDepositListener signature and logic >>>
    const startDepositListener = useCallback((isLoggedIn: boolean, currentUserNpub: string | null, decryptDm: (senderPubkeyHex: string, ciphertext: string) => Promise<string>) => {
        // <<< Check ndk directly >>>
        if (!ndk) {
            console.warn('useWallet: Cannot start deposit listener: NDK not ready.');
            // Don't set wallet error here, App level should indicate NDK issues
            return;
        }
        // <<< Use passed-in parameters >>>
        if (!isLoggedIn || !currentUserNpub) {
            console.warn('useWallet: Cannot start deposit listener: User not logged in.');
            // setWalletError('Login required to listen for deposits.'); // Keep this?
            return;
        }
        if (depositSubRef.current) {
            console.log('useWallet: Deposit listener already running.');
            return;
        }

        // <<< Use passed-in parameter >>>
        console.log('useWallet: Starting deposit listener for pubkey:', currentUserNpub);
        if (isMountedRef.current) {
            setIsListeningForDeposits(true);
            setWalletError(null);
        }

        // <<< Use passed-in parameter >>>
        const userHexPubkey = nip19.decode(currentUserNpub).data as string;

        // <<< Calculate dynamic since timestamp >>>
        const defaultLookbackDuration = 24 * 60 * 60; // 24 hours
        const lastCheck = lastCheckedTimestampRef.current;
        // Look back slightly before the last check to avoid missing events due to clock skew
        const lookbackBuffer = 60; // 60 seconds
        const sinceTimestamp = lastCheck 
            ? Math.max(0, lastCheck - lookbackBuffer) // Go back buffer seconds from last check
            : Math.floor(Date.now() / 1000) - defaultLookbackDuration; // Or default lookback
        
        console.log(`useWallet: Subscribing for DMs since timestamp: ${sinceTimestamp} (Last check: ${lastCheck})`);

        const filter: NDKFilter = {
            kinds: [4],
            '#p': [userHexPubkey],
            since: sinceTimestamp
        };

        // <-- ADD LOGGING HERE -->
        console.log('useWallet: Filter object being passed to ndk.subscribe:', JSON.stringify(filter));

        const handleIncomingDm = async (event: NDKEvent) => {
            // <<< Use passed-in parameters >>>
            if (!decryptDm || !currentUserNpub) {
                console.warn(
                    'WALLET: Received DM event but auth parameters are missing, skipping.',
                    event.id,
                );
                return;
            }
            // Avoid processing own events if filter didn't catch it
             // <<< Use passed-in parameter >>>
            if (event.pubkey === userHexPubkey) return; // Compare hex pubkeys

            console.log(`WALLET: Received potential DM event ${event.id} from ${event.pubkey}`); // <-- ADDED LOG

            try {
                console.log(`WALLET: Attempting to decrypt DM ${event.id}...`); // <-- ADDED LOG
                 // <<< Use passed-in parameter >>>
                const decryptedContent = await decryptDm(
                    event.content, // Ciphertext is event.content
                    event.pubkey,  // Sender is event.pubkey
                );
                console.log(`WALLET: DM ${event.id} decrypted successfully.`); // <-- ADDED LOG
                console.log(`WALLET: Decrypted content (preview): ${decryptedContent.substring(0, 100)}...`); // <-- ADDED LOG

                // Basic regex to find Cashu tokens (adjust if needed)
                const tokenRegex = /(cashuA[A-Za-z0-9_-]+)/g;
                const matches = decryptedContent.match(tokenRegex);

                if (matches && matches.length > 0) {
                    const tokenString = matches[0]; // Assume first match is the main token
                    console.log(`WALLET: Found Cashu token in DM ${event.id}: ${tokenString.substring(0, 15)}...`); // <-- ADDED LOG

                    setIsLoadingWallet(true); // Indicate processing
                    setWalletError(null);

                    try {
                        console.log(`WALLET: Calling cashuHelper.redeemToken for token from DM ${event.id}...`); // <-- ADDED LOG
                        const redeemResult = await cashuHelper.redeemToken(tokenString);
                        const { proofs } = redeemResult;
                        const mintUrl = redeemResult.mintUrl;

                        console.log(
                            `WALLET: Successfully redeemed token from DM ${event.id}, received ${proofs.length} new proofs from mint ${mintUrl}.`, // <-- ADDED LOG
                        );
                        await idb.addProofs(proofs, mintUrl);
                        await loadWalletState(); // Reload state to reflect new balance
                        console.log(`WALLET: Wallet state reloaded after redemption from DM ${event.id}.`); // <-- ADDED LOG
                    } catch (redeemError) {
                        console.error(
                            `WALLET: Failed to redeem Cashu token from DM ${event.id}:`, // <-- UPDATED LOG
                            redeemError,
                        );
                        setWalletError(
                            `Failed to redeem token: ${
                                redeemError instanceof Error ? redeemError.message : String(redeemError)
                            }`,
                        );
                    } finally {
                        setIsLoadingWallet(false);
                    }
                } else {
                    console.log(`WALLET: No Cashu token found in decrypted content of DM ${event.id}.`); // <-- ADDED LOG
                }
            } catch (decryptError) {
                console.error(`WALLET: Failed to decrypt DM ${event.id}:`, decryptError); // <-- UPDATED LOG
                // Don't set walletError for decryption failures of random DMs
            }
        };

        // <<< Use ndk derived from hook >>>
        depositSubRef.current = ndk.subscribe(filter, { closeOnEose: true }); // Close on EOSE for initial catch-up

        // <<< Add null check >>>
        if (!depositSubRef.current) {
            console.error("useWallet: Failed to create subscription.");
            setWalletError("Failed to start deposit listener.");
            setIsListeningForDeposits(false);
            return;
        }

        depositSubRef.current.on('event', handleIncomingDm);

        depositSubRef.current.on('eose', () => {
            // ... existing code ...
        });

    // <<< Dependencies now include ndk derived from hook >>>
    }, [ndk, loadWalletState]); // Include ndk

    // --- Tipping / Sending --- 

    // <<< Update sendCashuTipWithSplits to use ndk derived from hook >>>
    const sendCashuTipWithSplits = useCallback(async (params: SendTipParams): Promise<boolean> => {
        const { primaryRecipientNpub, amountSats, auth, comment, eventIdToZap } = params;

        if (!ndk) {
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
            const dmNdkEvent = new NDKEvent(ndk); // Use NDK instance from hook
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
            await ndk.publish(dmNdkEvent);
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

    // <<< Dependencies now include ndk derived from hook >>>
    }, [proofs, configuredMintUrl, ndk, loadWalletState]); // Include ndk

    // <<< NEW: Function to export unspent proofs >>>
    const exportUnspentProofs = useCallback(async (): Promise<string | null> => {
        console.log("useWallet: Exporting unspent proofs...");
        if (!proofs || proofs.length === 0) {
            console.log("useWallet: No proofs to export.");
            return null;
        }
        try {
            // Serialize the current proofs array into a JSON string
            const proofsString = JSON.stringify(proofs);
            console.log(`useWallet: Exported ${proofs.length} proofs.`);
            return proofsString;
        } catch (error) {
            console.error("useWallet: Error serializing proofs for export:", error);
            setWalletError("Failed to prepare proofs for backup.");
            return null;
        }
    }, [proofs]); // Dependency on proofs state

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
        exportUnspentProofs,
    };
};