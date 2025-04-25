import React, { useState, useRef, useCallback } from 'react';
import QRCode from 'react-qr-code';
import { useAuthContext } from '../../context/AuthContext';
import { DEFAULT_MINT_URLS } from '../../hooks/useWallet'; // Needed for setting default mint on new key login

// <<< Moved Function >>>
const truncateNpub = (npub: string | null): string => {
    if (!npub) return '';
    if (npub.length <= 15) return npub; // npub1 + 6 chars + ... + 6 chars
    return `${npub.substring(0, 10)}...${npub.substring(npub.length - 5)}`;
};

interface AuthSettingsProps {
    setDisplayError: (error: string | null) => void;
    // We might need wallet context too, if creating identity sets default mint
    // Or pass the specific function needed as a prop
    setDefaultMintUrl: (url: string | null) => Promise<void>; // Pass function instead of full context
}

const AuthSettings: React.FC<AuthSettingsProps> = ({ setDisplayError, setDefaultMintUrl }) => {
    const auth = useAuthContext();

    // --- Moved State ---
    const [generatedNpub, setGeneratedNpub] = useState<string | null>(null);
    const [generatedNsec, setGeneratedNsec] = useState<string | null>(null);
    const [showNsecQR, setShowNsecQR] = useState<boolean>(false);
    const [nsecInput, setNsecInput] = useState<string>(''); // For login with nsec

    // --- Moved Refs ---
    const generateButtonRef = useRef<HTMLButtonElement>(null);
    const useIdentityButtonRef = useRef<HTMLButtonElement>(null);
    const showNsecButtonRef = useRef<HTMLButtonElement>(null);
    const connectSignerButtonRef = useRef<HTMLButtonElement>(null); // Ref for NIP-46 button
    const loginNsecInputRef = useRef<HTMLInputElement>(null); // Ref for Nsec input
    const loginNsecButtonRef = useRef<HTMLButtonElement>(null); // Ref for Nsec login button

    // --- Moved Handlers ---
    const handleGenerateKeys = useCallback(async () => {
        const confirmGeneration = window.confirm(
            "Generate New TV Identity?\\n\\n" +
            "This will create a unique Nostr identity (nsec/npub) for this TV. " +
            "You MUST back up the private key (nsec) shown afterwards, ideally by scanning the QR code with your phone. " +
            "Losing it means losing control of this TV's Nostr profile and the ability to set up follows.\\n\\n" +
            "Proceed with generation?"
        );

        if (!confirmGeneration) {
            console.log("User cancelled key generation.");
            return;
        }

        setDisplayError(null);
        setShowNsecQR(false);
        setGeneratedNsec(null);
        try {
            const keys = await auth.generateNewKeys();
            if (keys) {
                setGeneratedNpub(keys.npub);
                setGeneratedNsec(keys.nsec);
            } else {
                setDisplayError("Failed to generate keys. Check console.");
            }
        } catch (error) {
            console.error("Key generation error:", error);
            setDisplayError(`Error generating keys: ${error instanceof Error ? error.message : String(error)}`);
        }
    }, [auth, setDisplayError]);

    const handleShowNsecQR = useCallback(() => {
        if (generatedNsec) {
            console.warn("SECURITY RISK: Displaying nsec QR code.");
            alert("Guardian of the Keys:\nThis nsec is your sovereign TV identity. Guard it fiercely, share it never. Lose it, and your digital ghost wanders the void, unable to follow new media. Proceed?");
            setShowNsecQR(true);
            setTimeout(() => useIdentityButtonRef.current?.focus(), 50);
        }
    }, [generatedNsec]);

    const handleUseGeneratedIdentity = useCallback(async () => {
        if (generatedNsec) {
            setDisplayError(null);
            try {
                const success = await auth.loginWithNsec(generatedNsec);
                if (success) {
                    console.log("Successfully logged in with generated identity.");
                    try {
                        console.log(`Attempting to set default mint: ${DEFAULT_MINT_URLS[0]}`)
                        await setDefaultMintUrl(DEFAULT_MINT_URLS[0]);
                        console.log("Default mint URL set successfully.");
                    } catch (mintError) {
                        console.error("Error setting default mint URL:", mintError);
                    }
                    alert("Identity Saved! It's highly recommended to back up this nsec NOW using the QR code shown after login.");
                    setShowNsecQR(false);
                    // Reset generation state after successful use
                    setGeneratedNpub(null);
                    setGeneratedNsec(null);
                } else {
                    setDisplayError("Failed to save or login with the generated nsec.");
                }
            } catch (error) {
                console.error("Error saving/logging in with generated nsec:", error);
                setDisplayError(`Error using identity: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }, [auth, generatedNsec, setDisplayError, setDefaultMintUrl]);

    const handleInitiateNip46 = useCallback(async () => {
        setDisplayError(null);
        try {
            await auth.initiateNip46Connection();
        } catch (error) {
            console.error("NIP-46 Initiation Error:", error);
            setDisplayError(`Error starting NIP-46: ${error instanceof Error ? error.message : String(error)}`);
        }
    }, [auth, setDisplayError]);

    const handleLoginWithNsec = useCallback(async () => {
        if (!nsecInput.trim()) {
            setDisplayError("Please enter an nsec value.");
            return;
        }
        setDisplayError(null);
        try {
            const success = await auth.loginWithNsec(nsecInput.trim());
            if (success) {
                console.log("Successfully logged in with provided nsec.");
                setNsecInput('');
            } else {
                setDisplayError("Login failed. Invalid nsec or error saving.");
            }
        } catch (error) {
            console.error("Error logging in with nsec:", error);
            setDisplayError(`Login Error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }, [auth, nsecInput, setDisplayError]);

    // --- Moved JSX for Logged Out View ---
    return (
        <div className="space-y-4">
            <h3 className="text-lg font-semibold mb-3 text-purple-300 border-b border-gray-600 pb-1 text-center">Connect or Login</h3>
            {/* NIP-46 Connection */}
            <div className='text-center'>
                <button
                    ref={connectSignerButtonRef}
                    onClick={handleInitiateNip46}
                    disabled={auth.isGeneratingUri || !!auth.nip46ConnectUri}
                    className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-800 font-semibold"
                >
                    {auth.isGeneratingUri ? 'Generating Code...' : 'Connect Remote Signer (NIP-46)'}
                </button>
                {auth.nip46ConnectUri && !auth.isLoggedIn && (
                    <div className="mt-3 p-3 bg-white rounded shadow flex flex-col items-center">
                        <p className="text-black text-sm mb-2">Scan with NIP-46 compatible signer:</p>
                        <QRCode value={auth.nip46ConnectUri} size={160} level="L" />
                        <button
                            onClick={() => auth.cancelNip46Connection?.()} // Assuming cancel function exists
                            className="mt-3 text-xs text-gray-600 hover:text-black focus:outline-none focus:ring-1 focus:ring-gray-500 rounded px-1"
                            aria-label="Cancel NIP-46 Connection"
                        >
                            Cancel
                        </button>
                    </div>
                )}
            </div>

            <p className="text-center text-xs text-gray-500">- OR -</p>

            {/* Generate New Identity */}
            {!generatedNpub && !auth.nip46ConnectUri && (
                <button
                    ref={generateButtonRef}
                    onClick={handleGenerateKeys}
                    disabled={auth.isLoadingAuth}
                    className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800 font-semibold"
                >
                    Generate New TV Identity (nsec)
                </button>
            )}

            {/* Generation Flow UI */}
            {generatedNpub && (
                <div className="mt-4 p-3 border border-dashed border-yellow-500 rounded bg-yellow-900/20 space-y-3">
                    <p className="text-sm text-yellow-300">Generated New Identity:</p>
                    <p className="font-mono text-sm bg-gray-800 p-1 rounded break-all">{truncateNpub(generatedNpub)}</p>
                    {!showNsecQR && generatedNsec && (
                        <button
                            ref={showNsecButtonRef}
                            onClick={handleShowNsecQR}
                            className="w-full px-4 py-1 bg-yellow-600 hover:bg-yellow-700 text-black rounded text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2 focus:ring-offset-gray-800 font-semibold"
                        >
                            Show Private Key (nsec) QR
                        </button>
                    )}
                    {showNsecQR && generatedNsec && (
                        <div className="p-3 bg-white rounded shadow flex flex-col items-center">
                            <p className='text-red-700 font-bold text-center text-sm mb-2'>WARNING: PRIVATE KEY - GUARD THIS!</p>
                            <QRCode value={generatedNsec} size={128} level="L" />
                            <button
                                onClick={() => { setShowNsecQR(false); setTimeout(() => showNsecButtonRef.current?.focus(), 50) }}
                                className="mt-3 text-xs text-gray-600 hover:text-black focus:outline-none focus:ring-1 focus:ring-gray-500 rounded px-1"
                                aria-label="Hide Private Key QR Code"
                            >
                                Hide QR
                            </button>
                        </div>
                    )}
                    {generatedNsec && ( // Only show 'Use' button if nsec is generated
                        <button
                            ref={useIdentityButtonRef}
                            onClick={handleUseGeneratedIdentity}
                            disabled={auth.isLoadingAuth}
                            className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-gray-800 font-semibold"
                        >
                            Use This Identity
                        </button>
                    )}
                    <button
                        onClick={() => { setGeneratedNpub(null); setGeneratedNsec(null); setShowNsecQR(false); setDisplayError(null); setTimeout(() => generateButtonRef.current?.focus(), 50); }}
                        className="w-full text-xs text-gray-400 hover:text-white mt-1 focus:outline-none focus:underline"
                        aria-label="Cancel generation"
                    >
                        Cancel Generation
                    </button>
                </div>
            )}

            {/* Login with Existing Nsec */}
            {!generatedNpub && !auth.nip46ConnectUri && (
                <div className="mt-4 pt-4 border-t border-gray-700">
                    <p className="text-sm text-gray-400 mb-2">Login with existing nsec:</p>
                    <input
                        ref={loginNsecInputRef}
                        type="password" // Use password type to obscure input
                        value={nsecInput}
                        onChange={(e) => setNsecInput(e.target.value)}
                        placeholder="nsec1..."
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500 mb-2"
                        aria-label="Enter your nsec private key"
                    />
                    <button
                        ref={loginNsecButtonRef}
                        onClick={handleLoginWithNsec}
                        disabled={auth.isLoadingAuth || !nsecInput.trim()}
                        className="w-full px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:ring-offset-gray-800 font-semibold"
                    >
                        Login with Nsec
                    </button>
                </div>
            )}
        </div>
    );
};

export default AuthSettings; 