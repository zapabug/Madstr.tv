import { useState, useEffect, useCallback, useRef } from 'react';
import { Proof } from '@cashu/cashu-ts';
import { idb } from '../utils/idb'; // Use the consolidated idb export
import { cashuHelper } from '../utils/cashu';
import { UseAuthReturn } from './useAuth';
import NDK, { NDKEvent, NDKFilter, NDKSubscription } from '@nostr-dev-kit/ndk';
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

    // <<< Update startDepositListener to use NIP-59 Gift Wrap >>>
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

        console.log('useWallet: Starting NIP-59 Gift Wrap deposit listener for pubkey:', auth.currentUserNpub);
        if (isMountedRef.current) {
            setIsListeningForDeposits(true);
            setWalletError(null);
        }

        const userHexPubkey = nip19.decode(auth.currentUserNpub).data as string;
        // Subscribe to BOTH Kind 1059 (NIP-59 Gift Wrap) AND Kind 4 (NIP-04 fallback)
        const filter: NDKFilter = { kinds: [1059, 4], '#p': [userHexPubkey], since: Math.floor(Date.now() / 1000) - 60 * 60 }; // Check last hour

        const processCashuToken = async (plaintext: string) => {
            if (!configuredMintUrl) return;
            
            const tokenMatch = plaintext.match(/(cashuA[A-Za-z0-9_-]+)/);
            if (tokenMatch && tokenMatch[1]) {
                const token = tokenMatch[1];
                console.log('Found Cashu token in DM:', token);
                setWalletError('Processing incoming deposit...');

                try {
                    const { proofs: redeemedProofs } = await cashuHelper.redeemToken(token);
                    
                    if (redeemedProofs && redeemedProofs.length > 0) {
                        console.log(`Successfully redeemed ${redeemedProofs.length} proofs from token.`);
                        await idb.addProofs(redeemedProofs, configuredMintUrl);
                        await loadWalletState();
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
        };

        const handleIncomingDm = async (event: NDKEvent) => {
            if (!configuredMintUrl) {
                console.warn('Mint URL not configured.');
                return; 
            }
            
            console.log('Received potential deposit DM:', event.id, 'Kind:', event.kind);

            try {
                let plaintext: string | null = null;
                
                if (event.kind === 1059) {
                    // NIP-59 Gift Wrap - use unwrapGiftWrap
                    if (auth.unwrapGiftWrap) {
                        const unwrapped = await auth.unwrapGiftWrap(event.rawEvent());
                        if (unwrapped) {
                            plaintext = unwrapped.content;
                            console.log('Unwrapped Gift DM from:', unwrapped.senderPubkey);
                        }
                    }
                } else if (event.kind === 4) {
                    // NIP-04 Fallback (deprecated)
                    if (auth.decryptDm) {
                        plaintext = await auth.decryptDm(event.pubkey, event.content);
                        console.log('Decrypted NIP-04 DM (deprecated):', event.pubkey);
                    }
                }

                if (plaintext) {
                    await processCashuToken(plaintext);
                } else {
                    console.log('Could not decrypt message.');
                }
            } catch (decryptError) {
                console.error('Error processing DM:', decryptError);
            }
        };

        // <<< Use ndkInstance from props >>>
        depositSubRef.current = ndkInstance.subscribe(filter, { closeOnEose: false });
        depositSubRef.current.on('event', handleIncomingDm);
        depositSubRef.current.on('eose', () => console.log('useWallet: Deposit listener initial EOSE received.'));
        depositSubRef.current.on('close', (reason) => {
            console.log('useWallet: Deposit listener subscription closed:', reason);
            if (depositSubRef.current && isMountedRef.current) {
                depositSubRef.current = null;
                setIsListeningForDeposits(false);
            }
        });

    // <<< Update dependencies for useCallback >>>
    }, [isNdkReady, ndkInstance, configuredMintUrl, loadWalletState]);

    // --- Tipping / Sending --- 

    // <<< Update sendCashuTipWithSplits to use NIP-59 Gift Wrap >>>
    const sendCashuTipWithSplits = useCallback(async (params: SendTipParams): Promise<boolean> => {
        const { primaryRecipientNpub, amountSats, auth, comment, eventIdToZap: _eventIdToZap } = params;

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
        if (!auth.isLoggedIn || !auth.currentUserNpub) {
            console.error('sendCashuTipWithSplits: User not logged in.');
            setWalletError('Login required to send tips.');
            return false;
        }

        console.log(`useWallet: Attempting to send ${amountSats} sats tip to ${primaryRecipientNpub}...`);
        setWalletError("Preparing tip...");

        try {
            const proofsForMint = await idb.getProofsByMint(configuredMintUrl);
            if (cashuHelper.getProofsBalance(proofsForMint) < amountSats) {
                 throw new Error(`Insufficient balance at mint ${configuredMintUrl}. Need ${amountSats} sats.`);
            }

            // Create Cashu token for the tip amount
            const { token: cashuToken } = await cashuHelper.createTokenForAmount(amountSats, proofsForMint, configuredMintUrl);
            if (!cashuToken) {
                throw new Error('Failed to create Cashu token for tip.');
            }

            // Compose DM content
            let dmContent = cashuToken;
            if (comment) {
                dmContent = `${cashuToken}\n\n${comment}`;
            }

            // Get recipient hex pubkey
            const recipientHex = nip19.decode(primaryRecipientNpub).data as string;

            // Use NIP-59 Gift Wrap (preferred) or NIP-04 (fallback)
            let giftWrapEvent: any;
            
            if (auth.wrapDirectMessage) {
                // NIP-59 Gift Wrap
                console.log('useWallet: Sending tip via NIP-59 Gift Wrap...');
                const { event } = await auth.wrapDirectMessage(recipientHex, dmContent);
                giftWrapEvent = event;
            } else if (auth.encryptDm && auth.signEvent) {
                // NIP-04 Fallback (deprecated)
                console.log('useWallet: NIP-59 not available, falling back to NIP-04...');
                const encryptedContent = await auth.encryptDm(recipientHex, dmContent);
                
                const dmEvent = new NDKEvent(ndkInstance);
                dmEvent.kind = 4;
                dmEvent.content = encryptedContent;
                dmEvent.tags = [['p', recipientHex]];
                
                const signedEvent = await auth.signEvent(dmEvent.rawEvent());
                if (!signedEvent) {
                    throw new Error('Failed to sign DM event.');
                }
                dmEvent.sig = signedEvent.sig;
                giftWrapEvent = dmEvent;
            } else {
                throw new Error('No suitable encryption method available.');
            }

            // Publish the gift wrapped message
            await giftWrapEvent.publish();
            console.log('useWallet: Tip sent successfully via Gift Wrap DM!');

            setWalletError(null);
            return true;
        } catch (error) {
            console.error('Error sending tip:', error);
            setWalletError(`Failed to send tip: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
    }, [isNdkReady, ndkInstance, configuredMintUrl, loadWalletState]);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
            stopDepositListener();
        };
    }, [stopDepositListener]);

    return { proofs, balanceSats, isListeningForDeposits, walletError, isLoadingWallet, configuredMintUrl, startDepositListener, stopDepositListener, sendCashuTipWithSplits, setConfiguredMintUrl };
};