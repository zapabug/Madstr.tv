import React, { useState, useCallback, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useAuth, UseAuthReturn } from '../hooks/useAuth';
import QRCode from 'react-qr-code';
import NDK from '@nostr-dev-kit/ndk';

type NDKInstance = NDK;

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    ndkInstance: NDKInstance | undefined;
    onCloseAndRefresh?: () => void;
}

const truncateNpub = (npub: string | null): string => {
    if (!npub) return '';
    if (npub.length <= 15) return npub;
    return `${npub.substring(0, 10)}...${npub.substring(npub.length - 5)}`;
};

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, ndkInstance, onCloseAndRefresh }) => {
    const auth: UseAuthReturn = useAuth(ndkInstance);
    const [generatedNpub, setGeneratedNpub] = useState<string | null>(null);
    const [generatedNsec, setGeneratedNsec] = useState<string | null>(null);
    const [showNsecQR, setShowNsecQR] = useState<boolean>(false);
    const [showNsecBackupQR, setShowNsecBackupQR] = useState<boolean>(false);
    const [nsecInput, setNsecInput] = useState<string>('');
    const [displayError, setDisplayError] = useState<string | null>(null);
    const [npubPressCount, setNpubPressCount] = useState(0);
    const [hashtagInput, setHashtagInput] = useState<string>('');
    const [cacheCleared, setCacheCleared] = useState(false);
    const [videoPositionsCleared, setVideoPositionsCleared] = useState(false);
    const [focusedTagIndex, setFocusedTagIndex] = useState<number | null>(null);

    const modalRef = useRef<HTMLDivElement>(null);
    const closeButtonRef = useRef<HTMLButtonElement>(null);
    const generateButtonRef = useRef<HTMLButtonElement>(null);
    const useIdentityButtonRef = useRef<HTMLButtonElement>(null);
    const showNsecButtonRef = useRef<HTMLButtonElement>(null);
    const connectSignerButtonRef = useRef<HTMLButtonElement>(null);
    const loginNsecInputRef = useRef<HTMLInputElement>(null);
    const loginNsecButtonRef = useRef<HTMLButtonElement>(null);
    const loggedInNpubRef = useRef<HTMLDivElement>(null);
    const logoutButtonRef = useRef<HTMLButtonElement>(null);
    const hashtagInputRef = useRef<HTMLInputElement>(null);
    const addTagButtonRef = useRef<HTMLButtonElement>(null);
    const tagListRef = useRef<HTMLUListElement>(null);

    useEffect(() => {
        if (isOpen) {
            const timer = setTimeout(() => {
                if (auth.isLoggedIn && loggedInNpubRef.current) {
                    loggedInNpubRef.current?.focus();
                } else {
                    connectSignerButtonRef.current?.focus();
                }
            }, 100);

            const handleKeyDown = (e: KeyboardEvent) => {
                 if (e.key === 'Tab' && modalRef.current) {
                    const focusableElements = Array.from(
                        modalRef.current.querySelectorAll<HTMLElement>(
                         'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
                       )
                      ).filter(el => el.offsetParent !== null);

                     if (focusableElements.length === 0) return;

                     const firstElement = focusableElements[0];
                     const lastElement = focusableElements[focusableElements.length - 1];
                     const currentIndex = focusableElements.findIndex(el => el === document.activeElement);

                     if (e.shiftKey) {
                         if (document.activeElement === firstElement || currentIndex === -1) {
                             lastElement.focus();
                             e.preventDefault();
                         }
                     } else {
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
    }, [isOpen, auth.isLoggedIn, generatedNpub, generatedNsec, showNsecQR, auth.nip46ConnectUri]);

    const handleClose = useCallback(() => {
        setGeneratedNpub(null);
        setGeneratedNsec(null);
        setShowNsecQR(false);
        setShowNsecBackupQR(false);
        setDisplayError(null);
        setNpubPressCount(0);
        setNsecInput('');
        setHashtagInput('');
        onCloseAndRefresh?.();
        onClose();
    }, [onClose, onCloseAndRefresh]);

    const handleGenerateKeys = async () => {
        const confirmGeneration = window.confirm(
            "Generate New TV Identity?\\n\\n" +
            "This will create a unique Nostr identity (nsec/npub) for this TV. " +
            "You MUST back up the private key (nsec) shown afterwards, ideally by scanning the QR code with your phone. " +
            "Losing it means losing control of this TV's Nostr profile and follows.\\n\\n" +
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
    };

    const handleShowNsecQR = () => {
        if (generatedNsec) {
             console.warn("SECURITY RISK: Displaying nsec QR code.");
             alert("Guardian of the Keys:\nThis nsec is your sovereign TV identity. Guard it fiercely, share it never. Lose it, and your digital ghost wanders the void, unable to follow new media. Proceed?");
             setShowNsecQR(true);
             setShowNsecBackupQR(false);
             setTimeout(() => useIdentityButtonRef.current?.focus(), 50);
        }
    };

     const handleUseGeneratedIdentity = async () => {
        if (generatedNsec) {
            setDisplayError(null);
            try {
                const success = await auth.loginWithNsec(generatedNsec);
                if (success) {
                     console.log("Successfully logged in with generated identity.");
                     alert("Identity Saved! It's highly recommended to back up this nsec NOW using the QR code shown after login.");
                     setShowNsecBackupQR(true);
                     setGeneratedNpub(null);
                     setGeneratedNsec(null);
                     setShowNsecQR(false);
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
        } catch (error) {
            console.error("NIP-46 Initiation Error:", error);
            setDisplayError(`Error starting NIP-46: ${error instanceof Error ? error.message : String(error)}`);
        }
    };

    const handlePasteBunkerUri = async () => {
        setDisplayError(null);
        try {
            const text = await navigator.clipboard.readText();
            if (!text) {
                setDisplayError("Clipboard is empty");
                return;
            }
            if (!text.startsWith('bunker://') && !text.startsWith('nostrconnect://')) {
                setDisplayError("Invalid bunker URI. Should start with bunker:// or nostrconnect://");
                return;
            }
            await auth.connectWithBunkerUri(text);
        } catch (error) {
            console.error("Paste bunker URI Error:", error);
            setDisplayError(`Error reading clipboard: ${error instanceof Error ? error.message : String(error)}`);
        }
    };

    const handleConnectWithExtension = async () => {
        setDisplayError(null);
        try {
            await auth.connectWithExtension();
        } catch (error) {
            console.error("Extension connection error:", error);
            setDisplayError(`Error: ${error instanceof Error ? error.message : String(error)}`);
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
                setNsecInput('');
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
            setGeneratedNpub(null);
            setGeneratedNsec(null);
            setShowNsecQR(false);
            setShowNsecBackupQR(false);
            setNpubPressCount(0);
             setTimeout(() => connectSignerButtonRef.current?.focus(), 50);
        } catch (error) {
            console.error("Logout error:", error);
            setDisplayError(`Logout failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    };

    const handleNpubKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            const newCount = npubPressCount + 1;
            setNpubPressCount(newCount);
            console.log(`Npub press count: ${newCount}`);

            if (newCount >= 3) {
                console.log("Revealing nsec backup QR...");
                alert("Guardian of the Keys:\nRevealing the nsec again carries security risks. Ensure your surroundings are private.");
                setShowNsecBackupQR(true);
                setShowNsecQR(false);
                setNpubPressCount(0);
            } else {
                 if (loggedInNpubRef.current) {
                     loggedInNpubRef.current.style.transform = 'scale(1.05)';
                     setTimeout(() => {
                         if (loggedInNpubRef.current) {
                             loggedInNpubRef.current.style.transform = 'scale(1)';
                         }
                     }, 150);
                 }
                 if(showNsecBackupQR) setShowNsecBackupQR(false);
            }
        }
    };

     const handleAddTag = () => {
        const tagToAdd = hashtagInput.trim().toLowerCase().replace(/^#+/, '');
        if (tagToAdd && auth.followedTags && !auth.followedTags.includes(tagToAdd) && auth.setFollowedTags) {
            const newTags = [...auth.followedTags, tagToAdd];
            auth.setFollowedTags(newTags);
            setHashtagInput('');
            setTimeout(() => hashtagInputRef.current?.focus(), 50);
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
            setFocusedTagIndex(null);
            setTimeout(() => addTagButtonRef.current?.focus(), 50);
        }
     };

     const [videoTagInput, setVideoTagInput] = useState('');
     const videoTagInputRef = useRef<HTMLInputElement>(null);
     const [focusedVideoTagIndex, setFocusedVideoTagIndex] = useState<number | null>(null);
     const videoTagListRef = useRef<HTMLUListElement>(null);
     const addVideoTagButtonRef = useRef<HTMLButtonElement>(null);

     const handleAddVideoTag = () => {
        const tagToAdd = videoTagInput.trim().toLowerCase().replace(/^#+/, '');
        if (tagToAdd && auth.videoTags && !auth.videoTags.includes(tagToAdd) && auth.setVideoTags) {
            const newTags = [...auth.videoTags, tagToAdd];
            auth.setVideoTags(newTags);
            setVideoTagInput('');
            setTimeout(() => videoTagInputRef.current?.focus(), 50);
        } else if (!tagToAdd) {
             setDisplayError("Please enter a tag to add.");
        } else {
             setDisplayError(`Tag "${tagToAdd}" is already followed.`);
        }
     };

     const handleRemoveVideoTag = (tagToRemove: string) => {
        if (auth.videoTags && auth.setVideoTags) {
            const newTags = auth.videoTags.filter(tag => tag !== tagToRemove);
            auth.setVideoTags(newTags);
            setFocusedVideoTagIndex(null);
            setTimeout(() => addVideoTagButtonRef.current?.focus(), 50);
        }
     };

     const handleClearVideoPositions = () => {
        const confirmClear = window.confirm(
            "Clear video playback positions?\n\n" +
            "This will reset all video progress - videos will start from the beginning next time you watch them."
        );
        if (!confirmClear) return;
        
        const prefix = 'audioPlaybackPos_';
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(prefix)) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
        console.log(`Cleared ${keysToRemove.length} video playback positions from localStorage.`);
        setVideoPositionsCleared(true);
        setTimeout(() => setVideoPositionsCleared(false), 3000);
     };

     const handleClearMediaCache = async () => {
        const confirmClear = window.confirm(
            "Clear media note cache?\n\n" +
            "This will clear all cached media notes. The app will re-fetch content from relays on next load."
        );
        if (!confirmClear) return;
        
        try {
            const { idb } = await import('../utils/idb');
            await idb.clearMediaNotes();
            console.log("Media note cache cleared.");
            setCacheCleared(true);
            setTimeout(() => setCacheCleared(false), 3000);
        } catch (error) {
            console.error("Failed to clear media cache:", error);
            setDisplayError("Failed to clear cache. Check console.");
        }
     };

     const handleVideoTagListKeyDown = (event: React.KeyboardEvent<HTMLLIElement>, index: number, tag: string) => {
        if (!auth.videoTags) return;

        switch (event.key) {
            case 'ArrowUp':
                event.preventDefault();
                if (index > 0) {
                    setFocusedVideoTagIndex(index - 1);
                     (videoTagListRef.current?.children[index - 1] as HTMLLIElement)?.focus();
                } else {
                     addVideoTagButtonRef.current?.focus();
                     setFocusedVideoTagIndex(null);
                }
                break;
            case 'ArrowDown':
                event.preventDefault();
                if (index < auth.videoTags.length - 1) {
                    setFocusedVideoTagIndex(index + 1);
                     (videoTagListRef.current?.children[index + 1] as HTMLLIElement)?.focus();
                } else {
                    setFocusedVideoTagIndex(index);
                }
                break;
            case 'Enter':
            case ' ':
                event.preventDefault();
                handleRemoveVideoTag(tag);
                break;
            case 'ArrowLeft':
                event.preventDefault();
                addVideoTagButtonRef.current?.focus();
                setFocusedVideoTagIndex(null);
                break;
        }
    };

     useEffect(() => {
         if (focusedVideoTagIndex !== null && videoTagListRef.current?.children[focusedVideoTagIndex]) {
             (videoTagListRef.current.children[focusedVideoTagIndex] as HTMLLIElement).focus();
         }
     }, [focusedVideoTagIndex]);

    const handleTagListKeyDown = (event: React.KeyboardEvent<HTMLLIElement>, index: number, tag: string) => {
        if (!auth.followedTags) return;

        switch (event.key) {
            case 'ArrowUp':
                event.preventDefault();
                if (index > 0) {
                    setFocusedTagIndex(index - 1);
                     (tagListRef.current?.children[index - 1] as HTMLLIElement)?.focus();
                } else {
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
                    setFocusedTagIndex(index);
                }
                break;
            case 'Enter':
            case ' ':
                event.preventDefault();
                handleRemoveTag(tag);
                break;
            case 'ArrowLeft':
                event.preventDefault();
                addTagButtonRef.current?.focus();
                setFocusedTagIndex(null);
                break;
        }
    };

     useEffect(() => {
         if (focusedTagIndex !== null && tagListRef.current?.children[focusedTagIndex]) {
             (tagListRef.current.children[focusedTagIndex] as HTMLLIElement).focus();
         }
     }, [focusedTagIndex]);

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
                className="bg-gradient-to-br from-gray-800 to-gray-900 border border-purple-700/50 rounded-lg shadow-2xl p-6 w-full max-w-md h-auto max-h-[90vh] flex flex-col text-gray-200 overflow-y-auto"
        >
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

                {auth.isLoadingAuth && <p className="text-center text-purple-400 mb-4">Loading...</p>}
                {displayError && <p className="text-center text-red-500 bg-red-900/30 border border-red-600 rounded p-2 mb-4">{displayError}</p>}
                {auth.authError && <p className="text-center text-red-500 bg-red-900/30 border border-red-600 rounded p-2 mb-4">Auth Error: {auth.authError}</p>}

                 <div className="mb-6 p-4 bg-gray-700/30 rounded-lg border border-gray-600">
                    <h3 className="text-lg font-semibold mb-3 text-purple-300 border-b border-gray-600 pb-1">Identity</h3>

                    {auth.isLoggedIn ? (
                        <div className="space-y-3">
                             <p className="text-sm text-gray-400">Logged in as:</p>
                              <div
                                  ref={loggedInNpubRef}
                                  tabIndex={0}
                                  className="text-md font-mono p-2 bg-gray-800 rounded border border-transparent focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 cursor-pointer transition-transform duration-100"
                                  onClick={() => handleNpubKeyDown({ key: 'Enter', preventDefault: () => {}, stopPropagation: () => {} } as React.KeyboardEvent<HTMLDivElement>)}
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
                         <div className="space-y-4">

                             <div className='text-center space-y-3'>
                                 {auth.hasExtension && (
                                     <button
                                         onClick={handleConnectWithExtension}
                                         disabled={auth.isLoadingAuth}
                                         className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-gray-800 font-semibold"
                                     >
                                         Connect with Extension
                                     </button>
                                 )}
                                 <button
                                     ref={connectSignerButtonRef}
                                     onClick={handleInitiateNip46}
                                     disabled={auth.isGeneratingUri || !!auth.nip46ConnectUri || auth.isLoadingAuth}
                                     className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-800 font-semibold"
                                 >
                                     {auth.isGeneratingUri ? 'Generating Code...' : 'Show QR Code'}
                                 </button>
                                 {auth.nip46ConnectUri && !auth.isLoggedIn && (
                                      <div className="p-3 bg-white rounded shadow flex flex-col items-center">
                                          <p className="text-black text-sm mb-2">Scan with Amber Signer:</p>
                                          <QRCode value={auth.nip46ConnectUri} size={160} level="L" />
                                           <button
                                               onClick={() => auth.cancelNip46Connection?.()}
                                               className="mt-3 text-xs text-gray-600 hover:text-black focus:outline-none focus:ring-1 focus:ring-gray-500 rounded px-1"
                                               aria-label="Cancel NIP-46 Connection"
                                           >
                                               Cancel
                                           </button>
                                  </div>
                              )}
                                 <button
                                     onClick={handlePasteBunkerUri}
                                     disabled={auth.isLoadingAuth || !!auth.nip46ConnectUri}
                                     className="w-full px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:ring-offset-gray-800 font-semibold"
                                 >
                                     Paste bunker:// URI
                                 </button>
                              </div>

                             <p className="text-center text-xs text-gray-500">- OR -</p>

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
                                     {generatedNsec && (
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

                            {!generatedNpub && !auth.nip46ConnectUri && (
                                <div className="mt-4 pt-4 border-t border-gray-700">
                                     <p className="text-sm text-gray-400 mb-2">Login with existing nsec:</p>
                                     <input
                                         ref={loginNsecInputRef}
                                         type="password"
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

                <div className="mb-4 p-4 bg-gray-700/30 rounded-lg border border-gray-600">
                    <h3 className="text-lg font-semibold mb-3 text-purple-300 border-b border-gray-600 pb-1">Follow Hashtags</h3>
                    <div className="space-y-3 mb-3">
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-300">Enable Image Hashtag Filtering</span>
                            <button
                                type="button"
                                onClick={() => auth.setFetchImagesByTagEnabled(!auth.fetchImagesByTagEnabled)}
                                className={`px-4 py-1 rounded text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-offset-1 focus:ring-offset-gray-800 ${auth.fetchImagesByTagEnabled ? 'bg-purple-600 text-white' : 'bg-gray-600 text-gray-300'}`}
                                aria-label="Toggle Image Hashtag Filtering"
                            >
                                {auth.fetchImagesByTagEnabled ? 'ON' : 'OFF'}
                            </button>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-300">Enable Video Hashtag Filtering</span>
                            <button
                                type="button"
                                onClick={() => auth.setFetchVideosByTagEnabled(!auth.fetchVideosByTagEnabled)}
                                className={`px-4 py-1 rounded text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-offset-1 focus:ring-offset-gray-800 ${auth.fetchVideosByTagEnabled ? 'bg-purple-600 text-white' : 'bg-gray-600 text-gray-300'}`}
                                aria-label="Toggle Video Hashtag Filtering"
                            >
                                {auth.fetchVideosByTagEnabled ? 'ON' : 'OFF'}
                            </button>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-300">Enable Music Keyword Filtering</span>
                            <button
                                type="button"
                                onClick={() => auth.setFetchMusicByTagEnabled(!auth.fetchMusicByTagEnabled)}
                                className={`px-4 py-1 rounded text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-offset-1 focus:ring-offset-gray-800 ${auth.fetchMusicByTagEnabled ? 'bg-purple-600 text-white' : 'bg-gray-600 text-gray-300'}`}
                                aria-label="Toggle Music Keyword Filtering"
                            >
                                {auth.fetchMusicByTagEnabled ? 'ON' : 'OFF'}
                            </button>
                        </div>
                    </div>
                    {auth.isLoggedIn ? (
                        <>
                             <div className="flex items-center gap-2 mb-3">
                                 <span className="text-gray-400">#</span>
                                 <input
                                     ref={hashtagInputRef}
                                     type="text"
                                     value={hashtagInput}
                                     onChange={(e) => setHashtagInput(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
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
                                            tabIndex={0}
                                            className={`px-2 py-1 rounded text-sm cursor-pointer flex justify-between items-center ${focusedTagIndex === index ? 'bg-purple-700 text-white ring-2 ring-purple-400' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'} focus:outline-none focus:bg-purple-700 focus:text-white focus:ring-2 focus:ring-purple-400`}
                                            onFocus={() => setFocusedTagIndex(index)}
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

                <div className="mb-4 p-4 bg-gray-700/30 rounded-lg border border-gray-600">
                    <h3 className="text-lg font-semibold mb-3 text-blue-300 border-b border-gray-600 pb-1">Video Tags</h3>
                    {auth.isLoggedIn ? (
                        <>
                             <div className="flex items-center gap-2 mb-3">
                                 <span className="text-gray-400">#</span>
                                 <input
                                     ref={videoTagInputRef}
                                     type="text"
                                     value={videoTagInput}
                                     onChange={(e) => setVideoTagInput(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                                      placeholder="audio"
                                     className="flex-grow px-3 py-1.5 bg-gray-800 border border-gray-600 rounded text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                     aria-label="Enter video tag to follow (without #)"
                                     onKeyDown={(e) => { if (e.key === 'Enter') handleAddVideoTag(); }}
                                 />
                                 <button
                                     ref={addVideoTagButtonRef}
                                     onClick={handleAddVideoTag}
                                     disabled={!videoTagInput.trim()}
                                     className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800 text-sm font-semibold"
                                 >
                                     Add
                                 </button>
                             </div>
                            <p className="text-xs text-gray-500 mb-2">Video Tags (Press OK on tag to remove):</p>
                            {auth.videoTags && auth.videoTags.length > 0 ? (
                                <ul ref={videoTagListRef} className="max-h-32 overflow-y-auto space-y-1 bg-gray-800/50 p-2 rounded border border-gray-700">
                                    {auth.videoTags.map((tag, index) => (
                                        <li
                                            key={tag}
                                            tabIndex={0}
                                            className={`px-2 py-1 rounded text-sm cursor-pointer flex justify-between items-center ${focusedVideoTagIndex === index ? 'bg-blue-700 text-white ring-2 ring-blue-400' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'} focus:outline-none focus:bg-blue-700 focus:text-white focus:ring-2 focus:ring-blue-400`}
                                            onFocus={() => setFocusedVideoTagIndex(index)}
                                            onKeyDown={(e) => handleVideoTagListKeyDown(e, index, tag)}
                                            aria-label={`Tag ${tag}. Press OK to remove.`}
                                        >
                                            <span>#{tag}</span>
                                            <span className="text-xs text-gray-500 ml-2">(OK to Del)</span>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-sm text-gray-500 italic">No video tags followed yet.</p>
                            )}
                        </>
                    ) : (
                        <p className="text-sm text-gray-500 italic">Login to manage video hashtags.</p>
                    )}
                </div>

                <div className="mb-4 p-4 bg-gray-700/30 rounded-lg border border-gray-600">
                    <h3 className="text-lg font-semibold mb-3 text-gray-300 border-b border-gray-600 pb-1">Cache Management</h3>
                    <div className="space-y-3">
                        <div className="flex flex-col gap-2">
                            <button
                                onClick={handleClearVideoPositions}
                                className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-gray-800 font-semibold text-sm"
                            >
                                Clear Seen Videos
                            </button>
                            {videoPositionsCleared && (
                                <p className="text-green-400 text-xs text-center">Video positions cleared!</p>
                            )}
                        </div>
                        <div className="flex flex-col gap-2">
                            <button
                                onClick={handleClearMediaCache}
                                className="w-full px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-gray-800 font-semibold text-sm"
                            >
                                Clear Media Cache
                            </button>
                            {cacheCleared && (
                                <p className="text-green-400 text-xs text-center">Media cache cleared!</p>
                            )}
                        </div>
                    </div>
                </div>
        </motion.div>
        </motion.div>
    );
};

export default SettingsModal;
