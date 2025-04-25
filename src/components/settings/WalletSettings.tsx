import React, { useState, useRef, useCallback, useEffect } from 'react';
import QRCode from 'react-qr-code';
import { useAuthContext } from '../../context/AuthContext';
import { useWalletContext } from '../../context/WalletContext';
import { DEFAULT_MINT_URLS } from '../../hooks/useWallet';
import { TV_PUBKEY_NPUB } from '../../constants';

// <<< Moved Constant >>>
const PRESET_TIP_AMOUNTS: number[] = [210, 1000, 2121];

// <<< Moved Helper Component >>>
const CustomLoggedInIcon = () => (
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
    <path
      d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"
      fill="#8B5CF6"
      stroke="#F7931A"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

interface WalletSettingsProps {
    setDisplayError: (error: string | null) => void;
}

const WalletSettings: React.FC<WalletSettingsProps> = ({ setDisplayError }) => {
    const auth = useAuthContext();
    const wallet = useWalletContext();

    // --- State for Wallet Settings ---
    const [mintUrlInput, setMintUrlInput] = useState<string>('');
    const [isSavingMintUrl, setIsSavingMintUrl] = useState<boolean>(false);
    const [selectedDefaultTipAmount, setSelectedDefaultTipAmount] = useState<number>(auth.defaultTipAmount);

    // --- Refs for Wallet elements ---
    const mintUrlInputRef = useRef<HTMLInputElement>(null);
    const saveMintUrlButtonRef = useRef<HTMLButtonElement>(null);
    const walletMoreOptionsButtonRef = useRef<HTMLButtonElement>(null);
    const tipDevsButtonRef = useRef<HTMLButtonElement>(null);
    const defaultTipButtonsRef = useRef<(HTMLButtonElement | null)[]>([]);

    // --- Effects (Initialize Mint URL & Tip Amount) ---
    useEffect(() => {
        setMintUrlInput(wallet.configuredMintUrl ?? '');
        setSelectedDefaultTipAmount(auth.defaultTipAmount);
        setIsSavingMintUrl(false);
        // Don't re-run if only setDisplayError changes
    }, [wallet.configuredMintUrl, auth.defaultTipAmount]);

    // --- Handlers for Wallet Actions ---
    const handleSaveMintUrl = useCallback(async () => {
        if (mintUrlInput === wallet.configuredMintUrl) {
            console.log("Mint URL hasn't changed.");
            return;
        }
        setIsSavingMintUrl(true);
        setDisplayError(null);
        try {
            if (mintUrlInput && mintUrlInput.trim()) {
                new URL(mintUrlInput.trim()); // Check if it's a valid URL format
            }
            await wallet.setConfiguredMintUrl(mintUrlInput.trim() || null);
            console.log("WalletSettings: Mint URL saved.");
            // Optionally add success feedback here if desired
        } catch (error) {
            console.error("WalletSettings: Error saving mint URL:", error);
            const message = error instanceof Error ? error.message : String(error);
            setDisplayError(`Invalid Mint URL: ${message}`);
        } finally {
            setIsSavingMintUrl(false);
        }
    }, [mintUrlInput, wallet.configuredMintUrl, wallet.setConfiguredMintUrl, setDisplayError]);

    const handleWalletMoreOptions = useCallback(() => {
        console.log("Wallet 'More Options' clicked - Placeholder");
        alert("Wallet 'More Options' - Not yet implemented.");
    }, []);

    const handleSelectDefaultTip = useCallback((amount: number) => {
        setSelectedDefaultTipAmount(amount);
        auth.setDefaultTipAmount(amount);
    }, [auth.setDefaultTipAmount]);

    const handleTipDevs = useCallback(async () => {
        if (!wallet?.sendCashuTipWithSplits || !auth) {
            console.error("Tip Devs: Missing required context.");
            setDisplayError("Tipping function not available.");
            return;
        }
        const tipAmount = 2121; // Fixed amount
        if (wallet.balanceSats < tipAmount) {
            setDisplayError(`Insufficient balance to tip ${tipAmount} sats.`);
            return;
        }
        setDisplayError(null);
        try {
            console.log(`Attempting to tip ${tipAmount} sats to devs (${TV_PUBKEY_NPUB}).`);
            const success = await wallet.sendCashuTipWithSplits({
                primaryRecipientNpub: TV_PUBKEY_NPUB,
                amountSats: tipAmount,
                eventIdToZap: undefined,
                auth: auth,
            });
            if (success) {
                console.log("Successfully tipped devs!");
                // Optionally show success feedback via setDisplayError (e.g., green color)
                // setDisplayError("Successfully tipped devs! ⚡")
                setTimeout(() => setDisplayError(null), 2000); // Clear after 2s
            } else {
                console.error("Tip Devs failed: sendCashuTipWithSplits returned false.");
                if (!wallet.walletError) {
                    setDisplayError(`Tip failed: Unknown reason.`);
                }
                // walletError is already shown in the modal, no need to duplicate generally
            }
        } catch (error) {
            console.error("Error tipping devs:", error);
            const message = error instanceof Error ? error.message : String(error);
            setDisplayError(`Tip Error: ${message}`);
        }
    }, [wallet, auth, setDisplayError]);

    // --- Render Logic ---
    return (
        <>
            {/* Wallet Configuration Section */}
            <div className="mb-6 mt-4 p-4 bg-gray-700/30 rounded-lg border border-gray-600">
                <h3 className="text-lg font-semibold mb-3 text-purple-300 border-b border-gray-600 pb-1 text-center">Wallet Settings</h3>
                <div className="space-y-3">
                    {wallet.walletError && <p className="text-red-400 bg-red-900/40 p-2 rounded text-sm mt-2">{wallet.walletError}</p>}
                    {wallet.isLoadingWallet && <p className="text-purple-400 text-sm mt-2">Loading wallet...</p>}

                    {/* Mint URL Input Section */}
                    <div className="pt-3 mt-3 border-t border-gray-700/30">
                        <label htmlFor="mintUrlInput" className="block text-sm font-medium text-gray-400 mb-1">
                            Cashu Mint URL:
                        </label>
                        <div className="flex items-center gap-2">
                            <input
                                ref={mintUrlInputRef}
                                id="mintUrlInput"
                                type="url"
                                value={mintUrlInput}
                                onChange={(e) => setMintUrlInput(e.target.value)}
                                placeholder={DEFAULT_MINT_URLS[0]}
                                className="flex-grow px-3 py-1.5 bg-gray-800 border border-gray-600 rounded text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
                                aria-label="Cashu Mint URL"
                            />
                            <button
                                ref={saveMintUrlButtonRef}
                                onClick={handleSaveMintUrl}
                                disabled={isSavingMintUrl || mintUrlInput === wallet.configuredMintUrl}
                                className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-800 text-sm font-semibold"
                            >
                                {isSavingMintUrl ? 'Saving...' : 'Save'}
                            </button>
                        </div>
                        <div className="mt-3 flex items-start gap-4">
                            <div className="flex-1">
                                <p className="text-xs text-gray-500 mb-1">Recommended Mints:</p>
                                <ul className="list-disc list-inside space-y-0.5">
                                    {DEFAULT_MINT_URLS.filter((url: string) => url !== 'https://testnut.cashu.space').map((url: string) => (
                                        <li key={url} className="text-xs text-gray-400 truncate">{url}</li>
                                    ))}
                                </ul>
                            </div>
                            {auth.currentUserNpub && (
                                <div className="relative p-1 bg-white rounded shadow self-start">
                                    <QRCode value={`nostr:${auth.currentUserNpub}`} size={80} level="H" />
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                        <div className="w-1/3 h-1/3 opacity-90">
                                            <CustomLoggedInIcon />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <p className="text-xs text-gray-500 pt-3 border-t border-gray-700/50">
                        Deposit Instructions: Create a Cashu token and send it as a DM to the address shown in the QR code.
                    </p>
                    <p className="text-xs font-bold text-red-500/80 mt-1">
                        SECURITY WARNING: Do not store large amounts. Use at your own risk.
                    </p>

                    {/* More Options Button */}
                    <div className="pt-3 mt-3 border-t border-gray-700/30">
                        <button
                            ref={walletMoreOptionsButtonRef}
                            onClick={handleWalletMoreOptions}
                            className="w-full px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:ring-offset-gray-800 font-semibold"
                        >
                            More Options
                        </button>
                    </div>
                </div>
            </div>

            {/* Default Tip Amount Section */}
            <div className="mt-4 pt-4 border-t border-gray-700">
                <h3 className="text-lg font-semibold mb-3 text-purple-300 text-center">Default Tip (Focus+OK)</h3>
                <div className="flex items-center justify-center space-x-2"> {/* Centered items */}
                    {PRESET_TIP_AMOUNTS.map((amount: number, index: number) => (
                        <button
                            key={amount}
                            ref={el => { defaultTipButtonsRef.current[index] = el; }}
                            onClick={() => handleSelectDefaultTip(amount)}
                            className={`px-4 py-1.5 rounded text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 ${
                                selectedDefaultTipAmount === amount
                                    ? 'bg-green-600 text-white ring-green-500'
                                    : 'bg-gray-600 hover:bg-gray-500 text-gray-300 focus:ring-gray-500'
                            }`}
                            aria-pressed={selectedDefaultTipAmount === amount}
                            aria-label={`Set default tip to ${amount} sats`}
                        >
                            {amount} sats
                        </button>
                    ))}
                </div>
            </div>

            {/* Tip Devs Section */}
            {TV_PUBKEY_NPUB && (
                <div className="mt-4 pt-4 border-t border-gray-700">
                    <h3 className="text-lg font-semibold mb-3 text-purple-300 text-center">Tip Devs</h3>
                    <button
                        ref={tipDevsButtonRef}
                        onClick={handleTipDevs}
                        className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-800 font-semibold"
                    >
                        Tip Devs
                    </button>
                </div>
            )}
        </>
    );
};

export default WalletSettings; 