import React, { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth, UseAuthReturn } from '../hooks/useAuth'; // Assuming useAuth provides all necessary states and functions, and exports its return type
import { useWallet, UseWalletReturn } from '../hooks/useWallet'; // Import useWallet
import QRCode from 'react-qr-code'; // Import QRCode for backup

// Helper to truncate npub/nsec
const truncateKey = (key: string | null, length = 16): string => {
    if (!key) return 'N/A';
    if (key.length <= length) return key;
    return `${key.substring(0, length / 2)}...${key.substring(key.length - length / 2)}`;
};

// Define component props
export interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    // REMOVED: ndkInstance prop is no longer needed
}

// Function to truncate npub for display
const truncateNpub = (npub: string | null): string => {
    if (!npub) return '';
    if (npub.length <= 15) return npub; // npub1 + 6 chars + ... + 6 chars
    return `${npub.substring(0, 10)}...${npub.substring(npub.length - 5)}`;
};

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
    // Use auth hook (gets necessary stores internally via useStore)
    const auth = useAuth();
    const wallet: UseWalletReturn = useWallet(); // Use the wallet hook
    const [generatedNpub, setGeneratedNpub] = useState<string | null>(null);
    const [generatedNsec, setGeneratedNsec] = useState<string | null>(null);
    const [showNsecQR, setShowNsecQR] = useState<boolean>(false);
    const [showNsecBackupQR, setShowNsecBackupQR] = useState<boolean>(false); // For logged-in user backup
    const [nsecInput, setNsecInput] = useState<string>(''); // For login with nsec
    const [displayError, setDisplayError] = useState<string | null>(null);
    const [npubPressCount, setNpubPressCount] = useState(0); // Counter for nsec reveal
    const [hashtagInput, setHashtagInput] = useState<string>(''); // For adding hashtags
    const [focusedTagIndex, setFocusedTagIndex] = useState<number | null>(null); // For tag list navigation/deletion
    const [mintUrlInput, setMintUrlInput] = useState<string>(''); // State for Mint URL input
    const [isSavingMintUrl, setIsSavingMintUrl] = useState<boolean>(false); // Loading state for save button

    const modalRef = useRef<HTMLDivElement>(null);
    const closeButtonRef = useRef<HTMLButtonElement>(null);
    const generateButtonRef = useRef<HTMLButtonElement>(null);
    const useIdentityButtonRef = useRef<HTMLButtonElement>(null);
    const showNsecButtonRef = useRef<HTMLButtonElement>(null);
    const connectSignerButtonRef = useRef<HTMLButtonElement>(null); // Ref for NIP-46 button
    const loginNsecInputRef = useRef<HTMLInputElement>(null); // Ref for Nsec input
    const loginNsecButtonRef = useRef<HTMLButtonElement>(null); // Ref for Nsec login button
    const loggedInNpubRef = useRef<HTMLDivElement>(null); // Ref for the logged-in npub display
    const logoutButtonRef = useRef<HTMLButtonElement>(null);
    const hashtagInputRef = useRef<HTMLInputElement>(null);
    const addTagButtonRef = useRef<HTMLButtonElement>(null);
    const tagListRef = useRef<HTMLUListElement>(null);
    const mintUrlInputRef = useRef<HTMLInputElement>(null); // Ref for Mint URL input
    const saveMintUrlButtonRef = useRef<HTMLButtonElement>(null); // Ref for Save Mint URL button

    // Effect to initialize Mint URL input when modal opens or wallet loads
    useEffect(() => {
        if (isOpen && auth.isLoggedIn && wallet.configuredMintUrl !== null) {
            setMintUrlInput(wallet.configuredMintUrl);
        } else if (isOpen && auth.isLoggedIn) {
            // If logged in but no URL configured yet, maybe set a default placeholder or empty
            setMintUrlInput(''); // Or DEFAULT_MINT_URL placeholder?
        }
        // Reset saving state when modal opens/closes or URL changes upstream
        setIsSavingMintUrl(false);
    }, [isOpen, auth.isLoggedIn, wallet.configuredMintUrl]);

    // Effect to start/stop deposit listener based on login state
    useEffect(() => {
        if (isOpen && auth.isLoggedIn) { // Check only for login state now
            console.log('SettingsModal: Attempting to start deposit listener.');
            wallet.startDepositListener(auth, null); // Pass null temporarily
        } else {
             console.log('SettingsModal: Stopping deposit listener (modal closed or not logged in).');
            wallet.stopDepositListener();
        }
        // Ensure listener stops when modal closes or user logs out
        return () => {
            console.log('SettingsModal: Cleaning up deposit listener effect.');
            wallet.stopDepositListener();
        };
        // Dependencies: isOpen, auth object, wallet hook instance (ndk removed)
    }, [isOpen, auth, wallet]);

    // Focus trapping and initial focus
    useEffect(() => {
        if (isOpen) {
            const timer = setTimeout(() => {
                if (auth.isLoggedIn && loggedInNpubRef.current) {
                    loggedInNpubRef.current?.focus(); // Default to npub first
                 } else if (auth.isLoggedIn && mintUrlInputRef.current) {
                     // Maybe focus Mint URL input as alternative?
                     // mintUrlInputRef.current.focus();
                } else {
                     // ... existing fallback focus logic ...
                     connectSignerButtonRef.current?.focus();
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
    }, [isOpen, auth.isLoggedIn, generatedNpub, generatedNsec, showNsecQR, auth.nip46ConnectUri, wallet.configuredMintUrl]);

    const handleClose = useCallback(() => {
        // Reset temporary generation state on close
        setGeneratedNpub(null);
        setGeneratedNsec(null);
        setShowNsecQR(false);
        setShowNsecBackupQR(false);
        setDisplayError(null);
        setNpubPressCount(0);
        setNsecInput('');
        setHashtagInput('');
        setMintUrlInput('');
        setIsSavingMintUrl(false);
        onClose();
    }, [onClose]);

    const handleGenerateKeys = async () => {
        setDisplayError(null);
        setShowNsecQR(false);
        setGeneratedNsec(null); // Clear previous nsec if re-generating
        try {
            const keys = await auth.generateNewKeys();
            if (keys) {
                setGeneratedNpub(keys.npub);
                setGeneratedNsec(keys.nsec); // Store nsec temporarily
                // DO NOT automatically show QR here, wait for button press
            } else {
                setDisplayError("Failed to generate keys. Check console.");
            }
        } catch (error) {
            console.error("Key generation error:", error);
            setDisplayError(`Error generating keys: ${error instanceof Error ? error.message : String(error)}`);
        }
    };

    const handleShowNsecQR = () => {
        if (generatedNsec) {
             // **Guardian of the Keys Warning** (Could be a separate confirmation step)
             console.warn("SECURITY RISK: Displaying nsec QR code.");
             alert("Guardian of the Keys:\nThis nsec is your sovereign TV identity. Guard it fiercely, share it never. Lose it, and your digital ghost wanders the void, unable to follow new media. Proceed?");
             setShowNsecQR(true);
             setShowNsecBackupQR(false); // Hide backup QR if generation QR is shown
             // Focus the "Use This Identity" button after showing QR
             setTimeout(() => useIdentityButtonRef.current?.focus(), 50);
        }
    };

     const handleUseGeneratedIdentity = async () => {
        if (generatedNsec) {
            setDisplayError(null);
            try {
                // Attempt to save and login
        const success = await auth.loginWithNsec(generatedNsec);
        if (success) {
                     console.log("Successfully logged in with generated identity.");
                     // Optional: Prompt immediate backup after first save
                     alert("Identity Saved! It's highly recommended to back up this nsec NOW using the QR code shown after login.");
                     setShowNsecBackupQR(true); // Trigger backup QR display immediately after login
                     setGeneratedNpub(null); // Clear generation state
            setGeneratedNsec(null);
                     setShowNsecQR(false);
                    // Focus should shift to logged-in state view
                } else {
                    setDisplayError("Failed to save or login with the generated nsec.");
                }
            } catch (error) {
                 console.error("Error saving/logging in with generated nsec:", error);
                 setDisplayError(`Error using identity: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
     };

    const handleInitiateNip46 = async () => {
        setDisplayError(null);
        try {
            await auth.initiateNip46Connection();
            // URI state (auth.nip46ConnectUri) will update, triggering QR display
        } catch (error) {
            console.error("NIP-46 Initiation Error:", error);
            setDisplayError(`Error starting NIP-46: ${error instanceof Error ? error.message : String(error)}`);
        }
    };

    const handleLoginWithNsec = async () => {
        if (!nsecInput.trim()) {
            setDisplayError("Please enter an nsec value.");
            return;
        }
        setDisplayError(null);
        try {
            const success = await auth.loginWithNsec(nsecInput.trim());
            if (success) {
                console.log("Successfully logged in with provided nsec.");
                setNsecInput(''); // Clear input on success
                // Focus shifts to logged-in view
        } else {
                setDisplayError("Login failed. Invalid nsec or error saving.");
            }
        } catch (error) {
            console.error("Error logging in with nsec:", error);
            setDisplayError(`Login Error: ${error instanceof Error ? error.message : String(error)}`);
        }
    };

    const handleLogout = async () => {
        setDisplayError(null);
        try {
         await auth.logout();
            // Reset any local state tied to login
            setGeneratedNpub(null);
            setGeneratedNsec(null);
            setShowNsecQR(false);
            setShowNsecBackupQR(false);
            setNpubPressCount(0);
             // Focus should shift back to logged-out state view
             setTimeout(() => connectSignerButtonRef.current?.focus(), 50);
        } catch (error) {
            console.error("Logout error:", error);
            setDisplayError(`Logout failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    };

    const handleNpubKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Enter' || event.key === ' ') { // Treat Space as OK too for some remotes
            event.preventDefault();
            const newCount = npubPressCount + 1;
            setNpubPressCount(newCount);
            console.log(`Npub press count: ${newCount}`);

            if (newCount >= 3) {
                console.log("Revealing nsec backup QR...");
                // **Guardian of the Keys Warning**
                alert("Guardian of the Keys:\nRevealing the nsec again carries security risks. Ensure your surroundings are private.");
                setShowNsecBackupQR(true);
                setShowNsecQR(false); // Hide generation QR if backup QR is shown
                setNpubPressCount(0); // Reset count after showing
            } else {
                 // Optional: Visual feedback for presses < 3
                 if (loggedInNpubRef.current) {
                     loggedInNpubRef.current.style.transform = 'scale(1.05)';
                     setTimeout(() => {
                         if (loggedInNpubRef.current) {
                             loggedInNpubRef.current.style.transform = 'scale(1)';
                         }
                     }, 150);
                 }
                 // Hide QR if it was already shown and user interacts again
                 if(showNsecBackupQR) setShowNsecBackupQR(false);

            }
        }
    };

     // --- Hashtag Management ---

     const handleAddTag = () => {
        const tagToAdd = hashtagInput.trim().toLowerCase().replace(/^#+/, ''); // Remove leading # and spaces, lowercase
        if (tagToAdd && auth.followedTags && !auth.followedTags.includes(tagToAdd) && auth.setFollowedTags) {
            const newTags = [...auth.followedTags, tagToAdd];
            auth.setFollowedTags(newTags); // Update state via auth hook
            setHashtagInput(''); // Clear input
            setTimeout(() => hashtagInputRef.current?.focus(), 50); // Keep focus on input
        } else if (!tagToAdd) {
             setDisplayError("Please enter a tag to add.");
        } else {
             setDisplayError(`Tag "${tagToAdd}" is already followed.`);
        }
     };

     const handleRemoveTag = (tagToRemove: string) => {
        if (auth.followedTags && auth.setFollowedTags) {
            const newTags = auth.followedTags.filter(tag => tag !== tagToRemove);
            auth.setFollowedTags(newTags);
            setFocusedTagIndex(null); // Clear focus index after removal
            setTimeout(() => addTagButtonRef.current?.focus(), 50); // Focus add button after removing
        }
     };

     // Handle D-pad navigation and deletion in the tag list
    const handleTagListKeyDown = (event: React.KeyboardEvent<HTMLLIElement>, index: number, tag: string) => {
        if (!auth.followedTags) return;

        switch (event.key) {
            case 'ArrowUp':
                event.preventDefault();
                if (index > 0) {
                    setFocusedTagIndex(index - 1);
                     (tagListRef.current?.children[index - 1] as HTMLLIElement)?.focus();
                } else {
                    // Move focus up to the Add Tag button or input?
                     addTagButtonRef.current?.focus();
                     setFocusedTagIndex(null);
                }
                break;
            case 'ArrowDown':
                event.preventDefault();
                if (index < auth.followedTags.length - 1) {
                    setFocusedTagIndex(index + 1);
                     (tagListRef.current?.children[index + 1] as HTMLLIElement)?.focus();
                } else {
                    // Optionally loop back or focus another element below
                    setFocusedTagIndex(index); // Keep focus on last item
                }
                break;
            case 'Enter': // OK button
            case ' ':
                event.preventDefault();
                handleRemoveTag(tag);
                break;
            // Potentially handle Left/Right to move focus out of the list
            case 'ArrowLeft':
                event.preventDefault();
                addTagButtonRef.current?.focus(); // Example: move focus to Add button
                setFocusedTagIndex(null);
                break;
        }
    };

     // Focus the correct tag when the focusedTagIndex changes
     useEffect(() => {
         if (focusedTagIndex !== null && tagListRef.current?.children[focusedTagIndex]) {
             (tagListRef.current.children[focusedTagIndex] as HTMLLIElement).focus();
         }
     }, [focusedTagIndex]);


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
                    <h2 className="text-xl font-bold text-purple-400">Settings</h2>
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
                    <h3 className="text-lg font-semibold mb-3 text-purple-300 border-b border-gray-600 pb-1">Identity</h3>

                    {auth.isLoggedIn ? (
                        // --- Logged In View ---
                        <div className="space-y-3">
                             <p className="text-sm text-gray-400">Logged in as:</p>
                             <div
                                 ref={loggedInNpubRef}
                                 tabIndex={0} // Make it focusable
                                 className="text-md font-mono p-2 bg-gray-800 rounded border border-transparent focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 cursor-pointer transition-transform duration-100"
                                 onClick={() => handleNpubKeyDown({ key: 'Enter', preventDefault: () => {}, stopPropagation: () => {} } as any)} // Allow click too
                                 onKeyDown={handleNpubKeyDown}
                                 aria-label={`Logged in as ${truncateNpub(auth.currentUserNpub)}. Press OK 3 times to show backup QR.`}
                             >
                                 {truncateNpub(auth.currentUserNpub)}
                             </div>
                              {showNsecBackupQR && auth.currentUserNsecForBackup && (
                                 <div className="mt-2 p-3 bg-white rounded shadow flex flex-col items-center">
                                    <p className='text-red-700 font-bold text-center text-sm mb-2'>BACKUP QR - GUARD THIS!</p>
                                    <QRCode value={auth.currentUserNsecForBackup} size={128} level="L" />
                                    <button
                                        onClick={() => setShowNsecBackupQR(false)}
                                        className="mt-3 text-xs text-gray-600 hover:text-black focus:outline-none focus:ring-1 focus:ring-gray-500 rounded px-1"
                                        aria-label="Hide Backup QR Code"
                                    >
                                        Hide QR
                                    </button>
                                 </div>
                             )}

                            <button
                                ref={logoutButtonRef}
                                onClick={handleLogout}
                                className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-gray-800 font-semibold"
                            >
                                Logout
                            </button>
                        </div>
                     ) : (
                         // --- Logged Out View ---
                         <div className="space-y-4">

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
                                                onClick={() => {setShowNsecQR(false); setTimeout(() => showNsecButtonRef.current?.focus(), 50)}}
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
                    )}
                </div>

                {/* --- Hashtag Following Section --- */}
                <div className="mb-4 p-4 bg-gray-700/30 rounded-lg border border-gray-600">
                    <h3 className="text-lg font-semibold mb-3 text-purple-300 border-b border-gray-600 pb-1">Follow Hashtags</h3>
                    {auth.isLoggedIn ? (
                        <>
                             <div className="flex items-center gap-2 mb-3">
                                 <span className="text-gray-400">#</span>
                                 <input
                                     ref={hashtagInputRef}
                                     type="text"
                                     value={hashtagInput}
                                     onChange={(e) => setHashtagInput(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))} // Allow letters, numbers, underscore
                                     placeholder="music"
                                     className="flex-grow px-3 py-1.5 bg-gray-800 border border-gray-600 rounded text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
                                     aria-label="Enter hashtag to follow (without #)"
                                     onKeyDown={(e) => { if (e.key === 'Enter') handleAddTag(); }}
                                 />
                                 <button
                                     ref={addTagButtonRef}
                                     onClick={handleAddTag}
                                     disabled={!hashtagInput.trim()}
                                     className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-800 text-sm font-semibold"
                                 >
                                     Add
                                 </button>
                             </div>
                            <p className="text-xs text-gray-500 mb-2">Followed Tags (Press OK on tag to remove):</p>
                            {auth.followedTags && auth.followedTags.length > 0 ? (
                                <ul ref={tagListRef} className="max-h-32 overflow-y-auto space-y-1 bg-gray-800/50 p-2 rounded border border-gray-700">
                                    {auth.followedTags.map((tag, index) => (
                                        <li
                                            key={tag}
                                            tabIndex={0} // Make focusable
                                            className={`px-2 py-1 rounded text-sm cursor-pointer flex justify-between items-center ${focusedTagIndex === index ? 'bg-purple-700 text-white ring-2 ring-purple-400' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'} focus:outline-none focus:bg-purple-700 focus:text-white focus:ring-2 focus:ring-purple-400`}
                                            onFocus={() => setFocusedTagIndex(index)}
                                            // onBlur={() => setFocusedTagIndex(null)} // Maybe remove this to keep track of last focused
                                             onKeyDown={(e) => handleTagListKeyDown(e, index, tag)}
                                             aria-label={`Tag ${tag}. Press OK to remove.`}
                                        >
                                            <span>#{tag}</span>
                                            <span className="text-xs text-gray-500 ml-2">(OK to Del)</span>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-sm text-gray-500 italic">No tags followed yet.</p>
                            )}
                        </>
                    ) : (
                        <p className="text-sm text-gray-500 italic">Login to manage followed hashtags.</p>
                    )}
                </div>

                {/* Add other settings sections here (e.g., Tipping, Relays) */}

                 {/* Footer - Maybe Save button if needed later */}
                 {/* <div className="mt-auto pt-4 border-t border-gray-600">
                     <button
                         onClick={handleClose} // Or a save function later
                         className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-gray-800 font-semibold"
                     >
                         Close Settings
                     </button>
                 </div> */}

            </motion.div>
        </motion.div>
    );
};

export default SettingsModal; 