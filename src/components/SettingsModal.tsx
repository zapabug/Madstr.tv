import React, { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthContext } from '../context/AuthContext';
import { useWalletContext } from '../context/WalletContext';
import QRCode from 'react-qr-code';
import { FiRefreshCw } from 'react-icons/fi';
import { TV_PUBKEY_NPUB } from '../constants';
import HashtagSettings from './settings/HashtagSettings';
import AuthSettings from './settings/AuthSettings';
import WalletSettings from './settings/WalletSettings';

// Interface for props expected by SettingsModal
interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
    const auth = useAuthContext();
    const wallet = useWalletContext();
    const [displayError, setDisplayError] = useState<string | null>(null);
    const [isShowingBackupQR, setIsShowingBackupQR] = useState<boolean>(false);
    const [backupQRData, setBackupQRData] = useState<string | null>(null);
    const [logoutCountdown, setLogoutCountdown] = useState<number | null>(null);
    const [showLogoutConfirmation, setShowLogoutConfirmation] = useState<boolean>(false);

    const fetchImagesToggleRef = useRef<HTMLButtonElement>(null);
    const fetchVideosToggleRef = useRef<HTMLButtonElement>(null);

    const modalRef = useRef<HTMLDivElement>(null);
    const closeButtonRef = useRef<HTMLButtonElement>(null);
    const loggedInNpubRef = useRef<HTMLDivElement>(null);
    const logoutButtonRef = useRef<HTMLButtonElement>(null);
    const refreshDepositsButtonRef = useRef<HTMLButtonElement>(null);

    // Effect to start/stop deposit listener (uses wallet prop)
    useEffect(() => {
        // <<< Gate the entire effect based on isOpen >>>
        if (!isOpen) {
            // If the modal is not open, ensure the listener is stopped *once*
            // but don't set up the effect/cleanup cycle repeatedly.
            // Note: The stopDepositListener might still be called on initial mount
            // when isOpen is false, which is acceptable.
            return; // Exit the effect if modal is not open
        }

        // --- Effect logic when isOpen is true ---
        let listenerActive = false;
        if (auth.isLoggedIn) {
            console.log('SettingsModal: Attempting to start deposit listener.');
            wallet.startDepositListener(auth.isLoggedIn, auth.currentUserNpub, auth.decryptDm);
            listenerActive = true;
        } else {
             console.log('SettingsModal: Not starting listener (not logged in).');
             // Ensure it's stopped if user logs out while modal is open
             wallet.stopDepositListener();
        }

        // --- Cleanup function ---
        return () => {
            console.log('SettingsModal: Cleaning up deposit listener effect (modal closed or deps changed).');
            // Only stop if we actually started it in this effect run
            if (listenerActive) {
                wallet.stopDepositListener();
            }
        };
        // Keep dependencies, but the effect body now ignores changes if !isOpen
    }, [isOpen, auth.isLoggedIn, auth.currentUserNpub, auth.decryptDm, wallet.startDepositListener, wallet.stopDepositListener]);

    // Focus trapping and initial focus
    useEffect(() => {
        if (isOpen) {
            const timer = setTimeout(() => {
                if (auth.isLoggedIn && loggedInNpubRef.current) {
                    loggedInNpubRef.current?.focus();
                } else if (!auth.isLoggedIn) {
                     // Focus an element within AuthSettings - needs coordination or a different default
                    // For now, let the browser decide or focus the modal itself
                    modalRef.current?.focus();
                }
            }, 100);

            const handleKeyDown = (e: KeyboardEvent) => {
                 if (e.key === 'Tab' && modalRef.current) {
                    // Query ALL focusable elements, including new wallet inputs/buttons
                    const focusableElements = Array.from(
                        modalRef.current.querySelectorAll<HTMLElement>(
                         'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
                       )
                     ).filter(el => el.offsetParent !== null); // Filter out hidden elements

                     if (focusableElements.length === 0) return;

                     const firstElement = focusableElements[0];
                     const lastElement = focusableElements[focusableElements.length - 1];
                     const currentIndex = focusableElements.findIndex(el => el === document.activeElement);

                     if (e.shiftKey) { // Shift + Tab
                         if (document.activeElement === firstElement || currentIndex === -1) {
                             lastElement.focus();
                             e.preventDefault();
                         }
                     } else { // Tab
                         if (document.activeElement === lastElement || currentIndex === -1) {
                             firstElement.focus();
                             e.preventDefault();
                         }
                     }
                 } else if (e.key === 'Escape') {
                     handleClose();
                 }
             };

             document.addEventListener('keydown', handleKeyDown);
             return () => {
                 clearTimeout(timer);
                 document.removeEventListener('keydown', handleKeyDown);
             };
        }
    }, [isOpen, auth.isLoggedIn]);

    const handleClose = useCallback(() => {
        // Reset temporary generation state on close
        setDisplayError(null);
        setIsShowingBackupQR(false);
        setShowLogoutConfirmation(false);
        setBackupQRData(null);
        setLogoutCountdown(null);
        onClose();
    }, [onClose]);

    // <<< Actual logout logic, called after backup/countdown >>>
    const finalizeLogout = useCallback(async () => {
        console.log("Finalizing logout...");
        // Clear any existing countdown interval
        // (Interval clearing logic is in the useEffect below)
        setIsShowingBackupQR(false); // Hide QR modal
        setShowLogoutConfirmation(false); // Hide confirmation buttons
        setBackupQRData(null);
        setLogoutCountdown(null);
        setDisplayError(null);
        try {
            await auth.logout();
            // Reset any local state tied to login
            setTimeout(() => modalRef.current?.focus(), 50);
        } catch (error) {
            console.error("Logout error:", error);
            setDisplayError(`Logout failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }, [auth]); // Dependency: auth hook for logout function

    // <<< Modified logout handler to trigger backup QR first >>>
    const handleLogout = async () => {
        setDisplayError(null);
        setBackupQRData(null); // Clear previous data
        setLogoutCountdown(null);

        console.log("Logout initiated, attempting to export proofs...");

        try {
            // Reset confirmation state at the start
            setShowLogoutConfirmation(false);

            const proofsString = await wallet.exportUnspentProofs();

            if (proofsString && proofsString !== '[]') { // Check if proofs exist
                console.log("Proofs exported, showing backup QR.");
                setBackupQRData(proofsString);
                setIsShowingBackupQR(true);
                setLogoutCountdown(45); // Start 45 second countdown
            } else {
                console.log("No proofs to back up or export failed, proceeding directly to logout.");
                finalizeLogout(); // No proofs, logout immediately
            }
        } catch (error) {
            console.error("Error during proof export for logout backup:", error);
            setDisplayError("Error preparing wallet backup. Proceeding to logout.");
            // Proceed to logout even if backup fails, otherwise user is stuck
            setTimeout(finalizeLogout, 1500); // Give user a moment to see the error
        }
        // --- Old immediate logout logic removed --- 
        // try {
        //  await auth.logout();
        //     // Reset any local state tied to login
        // ...
        // } catch (error) { ... }
    };

    // <<< Effect for countdown timer >>>
    useEffect(() => {
        let intervalId: NodeJS.Timeout | null = null;

        if (isShowingBackupQR && logoutCountdown !== null && logoutCountdown > 0) {
            intervalId = setInterval(() => {
                setLogoutCountdown((prevCountdown) => {
                    if (prevCountdown === null) return null; // Should not happen
                    const nextCountdown = prevCountdown - 1;
                    if (nextCountdown <= 0) {
                        if (intervalId) clearInterval(intervalId);
                        // Timer ended, show confirmation buttons instead of logging out
                        setShowLogoutConfirmation(true);
                        return 0; 
                    }
                    return nextCountdown;
                });
            }, 1000);
        } else if (logoutCountdown === 0 && intervalId) {
             // Ensure cleanup if countdown somehow reaches 0 externally
             clearInterval(intervalId);
        }

        // Cleanup function to clear interval when component unmounts
        // or when the dependencies change (e.g., QR modal closes)
        return () => {
            if (intervalId) {
                clearInterval(intervalId);
            }
        };
    }, [isShowingBackupQR, logoutCountdown, finalizeLogout]); // Dependencies

    // <<< NEW: Handler for the toggle switch >>>
    const handleToggleFetchImagesByTag = useCallback(() => {
        auth.setFetchImagesByTagEnabled(!auth.fetchImagesByTagEnabled);
    }, [auth]); // Dependency: auth object containing the state and setter

    // <<< NEW: Handler for the video toggle switch >>>
    const handleToggleFetchVideosByTag = useCallback(() => {
        auth.setFetchVideosByTagEnabled(!auth.fetchVideosByTagEnabled);
    }, [auth]);

    // --- Render Logic ---

    if (!isOpen) return null;

    return (
        <motion.div
            ref={modalRef}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            aria-modal="true"
            role="dialog"
        >
            <motion.div
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                className="bg-gradient-to-br from-gray-800 to-gray-900 border border-purple-700/50 rounded-lg shadow-2xl p-6 w-full max-w-md h-auto max-h-[90vh] flex flex-col text-gray-200 overflow-y-auto" // Added overflow-y-auto
        >
            {/* Header */}
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-purple-400">Mad⚡tr.tv<span className="ml-6">SetUp</span></h2>
                <button
                        ref={closeButtonRef}
                        onClick={handleClose}
                        className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-800"
                        aria-label="Close Settings"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

                {/* Loading and Error Display */}
                {auth.isLoadingAuth && <p className="text-center text-purple-400 mb-4">Loading...</p>}
                {displayError && <p className="text-center text-red-500 bg-red-900/30 border border-red-600 rounded p-2 mb-4">{displayError}</p>}
                {auth.authError && <p className="text-center text-red-500 bg-red-900/30 border border-red-600 rounded p-2 mb-4">Auth Error: {auth.authError}</p>}


                {/* --- Authentication Section --- */}
                 <div className="mb-6 p-4 bg-gray-700/30 rounded-lg border border-gray-600">
                    {auth.isLoggedIn ? (
                        // --- Logged In: Only show balance here --- 
                        <div className="flex justify-between items-center"> {/* Removed text-center and space-y */}                            
                            <p ref={loggedInNpubRef} tabIndex={-1} className="text-xl font-semibold text-yellow-400 focus:outline-none focus:ring-1 focus:ring-purple-500 rounded px-1">
                                {wallet.balanceSats.toLocaleString()} sats
                            </p>
                            <button
                                ref={refreshDepositsButtonRef}
                                onClick={() => {
                                    console.log('Manual deposit refresh triggered.');
                                    wallet.stopDepositListener();
                                    setTimeout(() => wallet.startDepositListener(auth.isLoggedIn, auth.currentUserNpub, auth.decryptDm), 100);
                                }}
                                className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800"
                                aria-label="Refresh Deposit Check"
                                title="Check for new deposits"
                            >
                                <FiRefreshCw className="h-5 w-5" />
                            </button>
                        </div>
                     ) : (
                         // --- Logged Out View ---                         
                         <AuthSettings
                            setDisplayError={setDisplayError}
                            setDefaultMintUrl={wallet.setConfiguredMintUrl} // Pass the wallet function
                        />
                     )}
                </div> {/* This closes the Authentication Section div */}            

                {/* <<< MOVED UP: Wallet Section (excluding balance) >>> */}
                {auth.isLoggedIn && (
                    <WalletSettings setDisplayError={setDisplayError} />
                )}
                {/* <<< END MOVED Wallet Section >>> */}

                {/* <<< Fetch Images by Tag Toggle >>> */}
                {auth.isLoggedIn && (<div className="flex items-center justify-between pt-2 border-t border-gray-700 mt-4"> {/* Added top border/margin for separation */}
                    <label htmlFor="fetchImagesToggle" className="text-sm font-medium text-gray-300 cursor-pointer pr-4"> {/* Added padding right */}
                        Fetch images by followed hashtags
                    </label>
                    <button
                        ref={fetchImagesToggleRef}
                        id="fetchImagesToggle"
                        role="switch"
                        aria-checked={auth.fetchImagesByTagEnabled}
                        onClick={handleToggleFetchImagesByTag}
                        className={`${
                            auth.fetchImagesByTagEnabled ? 'bg-purple-600' : 'bg-gray-600'
                        } relative inline-flex flex-shrink-0 items-center h-6 rounded-full w-11 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-purple-500`}
                    >
                        <span className="sr-only">Use setting</span> {/* For accessibility */}
                        <span
                            aria-hidden="true"
                            className={`${
                                auth.fetchImagesByTagEnabled ? 'translate-x-6' : 'translate-x-1'
                            } pointer-events-none inline-block w-4 h-4 transform bg-white rounded-full shadow ring-0 transition duration-200 ease-in-out`}
                        />
                    </button>
                </div>)}

                {/* <<< Fetch Videos by Tag Toggle >>> */}
                {auth.isLoggedIn && (<div className="flex items-center justify-between pt-2"> {/* No top border needed if directly below */}
                    <label htmlFor="fetchVideosToggle" className="text-sm font-medium text-gray-300 cursor-pointer pr-4">
                        Fetch videos by followed hashtags
                    </label>
                    <button
                        ref={fetchVideosToggleRef}
                        id="fetchVideosToggle"
                        role="switch"
                        aria-checked={auth.fetchVideosByTagEnabled}
                        onClick={handleToggleFetchVideosByTag}
                        className={`${ // <<< Re-added template literal for styles >>>
                            auth.fetchVideosByTagEnabled ? 'bg-purple-600' : 'bg-gray-600'
                        } relative inline-flex flex-shrink-0 items-center h-6 rounded-full w-11 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-purple-500`}
                    >
                        <span className="sr-only">Use setting</span>
                        <span
                            aria-hidden="true"
                            className={`${ // <<< Re-added template literal for styles >>>
                                auth.fetchVideosByTagEnabled ? 'translate-x-6' : 'translate-x-1'
                            } pointer-events-none inline-block w-4 h-4 transform bg-white rounded-full shadow ring-0 transition duration-200 ease-in-out`}
                        />
                    </button>
                </div>)}

                {/* --- Hashtag Following Section --- */}
                {auth.isLoggedIn && (
                    <HashtagSettings setDisplayError={setDisplayError} />
                )}

                {/* --- Logout Button (Remains at bottom) --- */}
                {auth.isLoggedIn && (
                    <div className="mt-6 pt-4 border-t border-gray-700 text-center"> {/* Added top margin/border */}
                        <button
                            ref={logoutButtonRef}
                            onClick={handleLogout}
                            className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-gray-800 font-semibold"
                        >
                            Logout
                        </button>
                        {/* Logout Warning */}                            
                        <p className="text-xs text-yellow-500/80 pt-2">
                            Warning: Logging out without backing up your nsec will result in loss of access to your followed tags and possible loss of wallet balance.
                        </p>
                    </div>
                )}

            </motion.div>
            {/* --- Backup QR Code Modal on Logout --- */}
            <AnimatePresence>
                {isShowingBackupQR && backupQRData && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center z-60 p-4 text-center"
                        // No onClick handler to prevent closing
                    >
                        <h2 className="text-2xl font-bold text-yellow-400 mb-4">Wallet Backup Required</h2>
                        {!showLogoutConfirmation ? (
                            // --- Countdown Phase --- 
                            <div className="animate-pulse-border-red border-4 border-dashed border-red-600/80 p-4 rounded-lg">
                                <p className="text-gray-200 mb-1">Scan this QR code with a compatible app or copy the text below.</p>
                                <p className="text-red-400 font-semibold mb-4">🛑🚨 SAVE THIS SECURELY! 🚨🛑 It is needed to restore funds.</p>
                                <div className="bg-white p-4 rounded mb-4 inline-block">
                                    <QRCode value={backupQRData} size={256} level="L" />
                                </div>
                                <p className="text-lg text-purple-400 font-mono mb-2">
                                    Logging out in: {logoutCountdown}s
                                </p>
                                <p className="text-xs text-gray-500">Backup finished. Prepare to confirm logout.</p>
                            </div>
                        ) : (
                            // --- Confirmation Phase --- 
                            <div className="space-y-4">
                                <p className="text-xl text-gray-200">Wallet backup displayed.</p>
                                <p className="text-lg text-red-400">⚠️🔒💸❓ Are you sure you want to log out? ❓💸🔒⚠️</p>
                                <p className="text-xs text-yellow-500/80">
                                    Logging out clears your session and requires the nsec or remote signer to log back in. Ensure backup is saved.
                                </p>
                                <div className="flex justify-center gap-4 pt-4">
                                    <button
                                        onClick={finalizeLogout} // Confirm logout
                                        className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-semibold focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-gray-900"
                                    >
                                        Log Out
                                    </button>
                                    <button
                                        onClick={() => { // Cancel logout
                                            setIsShowingBackupQR(false);
                                            setShowLogoutConfirmation(false);
                                            setBackupQRData(null);
                                            setLogoutCountdown(null);
                                        }}
                                        className="px-6 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded font-semibold focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:ring-offset-gray-900"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

export default SettingsModal; 