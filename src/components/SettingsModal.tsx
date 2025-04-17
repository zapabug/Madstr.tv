import React, { useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../hooks/useAuth'; // Import useAuth
import QRCode from 'react-qr-code'; // Import QRCode for backup
import NDK from '@nostr-dev-kit/ndk'; // Import NDK type

// Helper to truncate npub/nsec
const truncateKey = (key: string | null, length = 16): string => {
    if (!key) return 'N/A';
    if (key.length <= length) return key;
    return `${key.substring(0, length / 2)}...${key.substring(key.length - length / 2)}`;
};


interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    ndkInstance: NDK | undefined; // Pass NDK instance down for auth hook
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, ndkInstance }) => {
    const auth = useAuth(ndkInstance); // Use the auth hook

    // State for newly generated keys (before saving)
    const [generatedNpub, setGeneratedNpub] = useState<string | null>(null);
    const [generatedNsec, setGeneratedNsec] = useState<string | null>(null);
    const [showNsecQR, setShowNsecQR] = useState<boolean>(false);
    const [generateError, setGenerateError] = useState<string | null>(null);


    const handleGenerateKeys = useCallback(async () => {
        setGeneratedNpub(null);
        setGeneratedNsec(null);
        setShowNsecQR(false);
        setGenerateError(null); // Clear previous errors
        auth.authError = null; // Clear hook errors too

        try {
            const keys = await auth.generateNewKeys();
            if (keys) {
                setGeneratedNpub(keys.npub);
                setGeneratedNsec(keys.nsec);
            } else {
                 // Error likely already set in auth hook, but set local too
                 setGenerateError(auth.authError || "Key generation failed.");
            }
        } catch (error: any) {
            console.error("Error generating keys in modal:", error);
            setGenerateError(error.message || "An unexpected error occurred during key generation.");
        }
    }, [auth]);

    const handleSaveAndUseKeys = useCallback(async () => {
        if (!generatedNsec) return;
        setShowNsecQR(false); // Hide QR on save attempt
        setGenerateError(null);
        auth.authError = null;

        const success = await auth.loginWithNsec(generatedNsec);
        if (success) {
            setGeneratedNpub(null); // Clear temporary state
            setGeneratedNsec(null);
            // Optionally close the modal on success?
            // onClose();
        } else {
            setGenerateError(auth.authError || "Failed to save and login with new keys.");
        }
    }, [auth, generatedNsec]);

     const handleLogout = useCallback(async () => {
         setShowNsecQR(false);
         setGeneratedNpub(null);
         setGeneratedNsec(null);
         setGenerateError(null);
         await auth.logout();
         // Potentially reset other settings state here if needed
     }, [auth]);


    // Reset temporary state when modal closes or auth state changes
    useEffect(() => {
        if (!isOpen) {
            setGeneratedNpub(null);
            setGeneratedNsec(null);
            setShowNsecQR(false);
             setGenerateError(null);
        }
    }, [isOpen]);

    // Handle potential errors displayed from the hook itself
    const displayError = generateError || auth.authError;


    if (!isOpen) return null;

    return (
        <motion.div
            initial={{ x: '-100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '-100%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed inset-y-0 left-0 z-50 w-1/3 max-w-md h-full bg-gray-900 bg-opacity-95 shadow-xl p-6 border-r border-gray-700 overflow-y-auto flex flex-col" // Added flex flex-col
            aria-modal="true"
            role="dialog"
        >
            {/* Header */}
            <div className="flex justify-between items-center mb-6 flex-shrink-0">
                <h2 className="text-2xl font-bold text-white">Settings</h2>
                <button
                    onClick={onClose}
                    className="p-2 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-blue-500"
                    aria-label="Close settings"
                    tabIndex={0} // Make focusable
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            {/* Scrollable Content Area */}
            <div className="flex-grow overflow-y-auto space-y-6 text-gray-300 pr-2"> {/* Added padding-right for scrollbar */}

                {/* Loading Auth State */}
                 {auth.isLoadingAuth && (
                     <div className="text-center p-4">Loading authentication...</div>
                 )}

                 {/* Auth Error Display */}
                 {displayError && (
                     <div className="bg-red-800 border border-red-600 text-white px-4 py-2 rounded-md text-sm">
                         Error: {displayError}
                     </div>
                 )}


                {/* Authentication Section */}
                <div className="border-b border-gray-700 pb-4">
                    <h3 className="text-lg font-semibold text-white mb-3">Authentication</h3>

                    {auth.isLoggedIn ? (
                        // --- Logged In View ---
                        <div className="space-y-3">
                            <p className="text-sm">
                                Logged in as:
                                <span className="font-mono ml-2 bg-gray-700 px-2 py-0.5 rounded text-purple-300">
                                    {truncateKey(auth.currentUserNpub)}
                                </span>
                            </p>
                            {/* TODO: Add NIP-46 status if connected via bunker */}
                            {/* TODO: Add Nsec QR Display logic (with 3-press confirmation) */}
                            <button
                                onClick={handleLogout}
                                className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-gray-900 text-white font-semibold"
                                tabIndex={0}
                            >
                                Logout
                            </button>
                        </div>
                    ) : generatedNpub ? (
                         // --- Generated Keys View (Before Saving) ---
                         <div className="space-y-4 p-3 bg-gray-800 rounded-lg border border-purple-700">
                             <h4 className="text-md font-semibold text-purple-300">New TV Identity Generated!</h4>
                             <p className="text-sm">
                                 Public Key (npub):
                                 <span className="block font-mono text-xs break-all bg-gray-700 px-2 py-1 rounded mt-1">
                                     {generatedNpub}
                                 </span>
                             </p>
                              <p className="text-xs text-yellow-400 font-semibold">
                                  IMPORTANT: Back up your Private Key (nsec) below BEFORE saving. It cannot be recovered if lost!
                             </p>

                             {/* Nsec QR Display */}
                             {showNsecQR && generatedNsec && (
                                <div className="p-3 bg-white rounded-md flex justify-center">
                                    <QRCode value={generatedNsec} size={160} level="L" />
                                 </div>
                             )}
                              {!showNsecQR && (
                                 <button
                                     onClick={() => setShowNsecQR(true)}
                                     className="w-full px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2 focus:ring-offset-gray-900 text-white font-semibold text-sm"
                                     tabIndex={0}
                                 >
                                     Show Backup QR (nsec) - Guard Fiercely!
                                 </button>
                              )}

                             <button
                                 onClick={handleSaveAndUseKeys}
                                 disabled={!generatedNsec}
                                 className={`w-full px-4 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-800 text-white font-semibold ${!generatedNsec ? 'bg-gray-600 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700'}`}
                                 tabIndex={0}
                            >
                                 Use This Identity
                             </button>
                              <button
                                 onClick={() => { setGeneratedNpub(null); setGeneratedNsec(null); setShowNsecQR(false); }} // Go back
                                 className="w-full px-4 py-2 mt-2 bg-gray-600 hover:bg-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:ring-offset-gray-800 text-white font-semibold text-sm"
                                 tabIndex={0}
                            >
                                 Cancel (Generate Again)
                             </button>
                         </div>
                    ) : (
                        // --- Logged Out View ---
                        <div className="space-y-3">
                            {/* Placeholder for NIP-46 Connect Button */}
                            <button
                                // onClick={auth.initiateNip46Connection} // TODO: Wire up later
                                disabled={true} // TODO: Enable later
                                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900 text-white font-semibold disabled:opacity-50"
                                tabIndex={0}
                            >
                                Connect Wallet (NIP-46) - Coming Soon
                            </button>

                             <p className="text-center text-xs text-gray-500 my-2">OR</p>

                            {/* Generate New Keys Button */}
                            <button
                                onClick={handleGenerateKeys}
                                className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-gray-900 text-white font-semibold"
                                tabIndex={0}
                            >
                                Generate New TV Identity (nsec)
                            </button>

                            {/* Placeholder for Login with Nsec Input */}
                            <p className="text-xs text-gray-500 mt-2">Login with existing nsec coming soon...</p>
                        </div>
                    )}
                </div>

                {/* Placeholder for Hashtag Following */}
                <div className="border-b border-gray-700 pb-4">
                    <h3 className="text-lg font-semibold text-white mb-2">Followed Hashtags</h3>
                    <p className="text-sm text-gray-400">Manage content filters here. (Coming Soon)</p>
                    {/* Hashtag management UI will appear here */}
                </div>

                 {/* Placeholder for Other Settings */}
                 <div>
                    <h3 className="text-lg font-semibold text-white mb-2">Other</h3>
                     <p className="text-sm text-gray-400">Relay settings, etc. (Coming Soon)</p>
                </div>
            </div>
        </motion.div>
    );
};

export default SettingsModal; 