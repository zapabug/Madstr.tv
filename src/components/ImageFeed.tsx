import React, { useRef, useEffect, useCallback, useState, forwardRef, useImperativeHandle } from 'react';
// useNdk no longer needed here
// import { useNdk } from 'nostr-hooks'; 
// NDK types no longer needed here
// import { NDKEvent, NDKFilter, NDKKind } from '@nostr-dev-kit/ndk';
// nip19 potentially still needed if displaying npubs
import { nip19 } from 'nostr-tools'; 
import { NostrNote, NostrProfile } from '../types/nostr'; 
import { useProfileData } from '../hooks/useProfileData';
import { motion, AnimatePresence } from 'framer-motion';
import QRCode from 'react-qr-code';
import { useWallet, SendTipParams, UseWalletReturn } from '../hooks/useWallet'; // Import wallet hook and types
import { useAuth, UseAuthReturn } from '../hooks/useAuth'; // Import auth hook for context
import { FiZap } from 'react-icons/fi'; // Import Zap icon
// NDK type is needed for useMediaAuthors return type
import NDK from '@nostr-dev-kit/ndk'; 
import { useNDKInit } from '../hooks/useNDKInit'; // <<< Use NDKInit to get instance >>>

// Remove internal MediaNote interface if NostrNote is sufficient
/*
interface MediaNote {
  id: string; // Event ID
  eventId: string; // Use id
  type: 'image' | 'video'; // Can be inferred from tags/content?
  url: string; // Should be in content or tags
  posterNpub: string; // Map to posterPubkey
  createdAt: number; // Map to created_at
}
*/

// Update props: remove authors, onNotesLoaded, add isLoading, authorNpub
export interface MediaFeedProps {
  // authors: string[]; // Removed
  isLoading: boolean; // Added
  handlePrevious: () => void;
  handleNext: () => void;
  currentImageIndex: number;
  imageNotes: NostrNote[]; 
  authorNpub: string | null; // Added
  // onNotesLoaded: (notes: NostrNote[]) => void; // Removed
  isPlaying: boolean;
  togglePlayPause: () => void;
  isFullScreen: boolean;
  signalInteraction: (interaction: string) => void;
}

export interface ImageFeedRef {
  focusToggleButton: () => void;
}

// Loading messages array
const loadingMessages = [
  "Tuning into the cosmic streams...",
  "Aligning the digital constellations...",
  "Reticulating splines...",
  "Charging the flux capacitor...",
  "Brewing cyber-coffee...",
  "Asking the magic smoke nicely...",
  "Untangling the timelines...",
  "Polishing the pixels...",
];

const DEFAULT_TIP_AMOUNT = 121; // Sats

// Define your custom SVG component or markup here
const CustomLoggedInIcon = () => (
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
    {/* Lightning bolt path with specified colors */}
    <path 
      d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" 
      fill="#8B5CF6" 
      stroke="#F7931A" 
      strokeWidth="1.5" // Adjust stroke width as needed
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
  </svg>
);

const ImageFeed = forwardRef<ImageFeedRef, MediaFeedProps>((
  { 
    // authors, // Removed
    isLoading, // Added
    handlePrevious,
    handleNext,
    currentImageIndex,
    imageNotes, 
    authorNpub, // Added
    // onNotesLoaded, // Removed
    isPlaying,
    togglePlayPause,
    isFullScreen,
    signalInteraction,
  },
  ref 
) => {
  // Remove NDK and internal fetching state
  // const { ndk } = useNdk();
  // const notesById = useRef<Map<string, NostrNote>>(new Map()); 
  // const [isLoading, setIsLoading] = useState(true); // Use prop instead
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const toggleButtonRef = useRef<HTMLButtonElement>(null);
  const { profiles } = useProfileData(imageNotes); // Keep profile fetching based on notes prop

  // --- Hooks ---
  // <<< Get NDK instance and readiness >>>
  const { ndkInstance, isConnecting: isNdkConnecting, connectionError: ndkConnectionError } = useNDKInit();
  // <<< Derive isNdkReady correctly >>>
  const isNdkReady = !!ndkInstance && !isNdkConnecting && !ndkConnectionError;
  
  // <<< Pass NDK props to useWallet >>>
  const wallet: UseWalletReturn = useWallet({ ndkInstance, isNdkReady }); 
  // <<< Pass NDK instance to useAuth >>>
  const auth: UseAuthReturn = useAuth(ndkInstance);
  
  const [isTipping, setIsTipping] = useState(false);
  const [tipStatus, setTipStatus] = useState<'success' | 'error' | null>(null);
  const authorContainerRef = useRef<HTMLDivElement>(null); // Ref for the author info container

  // --- Loading Message Cycling (Keep) --- 
   useEffect(() => {
    const intervalId = setInterval(() => {
      setLoadingMessageIndex(prevIndex => (prevIndex + 1) % loadingMessages.length);
    }, 2500); 
    return () => clearInterval(intervalId); 
  }, []);

  // --- Effect to Scroll to Current Image (Keep) ---
  useEffect(() => {
    if (imageNotes.length > 0 && currentImageIndex < imageNotes.length) {
       const targetElement = document.getElementById(`media-item-${imageNotes[currentImageIndex]?.id}`);
       targetElement?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }
  }, [currentImageIndex, imageNotes]);

  // --- REMOVED Effect to Fetch Notes --- 
  // useEffect(() => { ... fetching logic removed ... }, [ndk, authors, onNotesLoaded]);

  // --- Expose focusToggleButton via useImperativeHandle (Keep) ---
  React.useImperativeHandle(ref, () => ({
    focusToggleButton: () => {
      console.log("ImageFeed: focusing toggle button via handle");
      // Focus the author container instead if available and tipping enabled
      if (authorContainerRef.current && canTip) {
          authorContainerRef.current.focus();
      } else {
         toggleButtonRef.current?.focus();
      }
    }
  }));

  // Find the current image note
  const currentImageNote = imageNotes && imageNotes.length > 0 && currentImageIndex >= 0 && currentImageIndex < imageNotes.length
    ? imageNotes[currentImageIndex]
    : null;
  const imageUrl = currentImageNote?.url;
  // <<< Get profile data needed for display >>>
  const profile = currentImageNote?.posterPubkey ? profiles[currentImageNote.posterPubkey] : undefined;
  const displayName = profile?.name || profile?.displayName || currentImageNote?.posterPubkey?.substring(0, 10) || 'Anon';
  const timestamp = currentImageNote?.created_at ? new Date(currentImageNote.created_at * 1000).toLocaleString() : 'Date unknown';

  const currentNoteId = currentImageNote?.id;
  // Ensure ndkInstance is checked for canTip
  const canTip = !wallet.isLoadingWallet && !isTipping && wallet.balanceSats >= DEFAULT_TIP_AMOUNT && authorNpub && auth.isLoggedIn && !!ndkInstance && isNdkReady;

  // <<< Log received props and derived values >>>
  console.log("ImageFeed Render:", {
      isLoading,
      currentImageIndex,
      notesCount: imageNotes.length,
      currentNoteId,
      imageUrl,
      authorNpub,
      displayName,
      isPlaying // Log playback state received
  });

  // --- Tipping Handler ---
  const handleTip = useCallback(async () => {
    // Check ndkInstance readiness here too
    if (!canTip || !authorNpub || !ndkInstance || !auth || !isNdkReady) {
        console.warn('Cannot tip: Conditions not met', { canTip, authorNpub, ndkInstance: !!ndkInstance, auth: !!auth, isNdkReady });
        return;
    }

    setIsTipping(true);
    setTipStatus(null);
    console.log(`Attempting to tip ${DEFAULT_TIP_AMOUNT} sats to ${authorNpub}`);

    const params: SendTipParams = {
        primaryRecipientNpub: authorNpub,
        amountSats: DEFAULT_TIP_AMOUNT,
        auth: auth, // Pass the auth object
        eventIdToZap: currentNoteId, 
        comment: `📺⚡️ Tip from Mad⚡tr.tv TV App!` 
    };

    try {
        // sendCashuTipWithSplits now uses NDK instance internally from useWallet
        const success = await wallet.sendCashuTipWithSplits(params);
        if (success) {
            console.log('Tip successful!');
            setTipStatus('success');
            // Trigger visual feedback (e.g., flash checkmark)
            // Balance updates automatically via wallet hook
        } else {
            console.error('Tip failed.', wallet.walletError);
            setTipStatus('error');
            // Trigger visual feedback (e.g., flash error)
        }
    } catch (error) {
        console.error('Exception during tip:', error);
        setTipStatus('error');
    } finally {
        setIsTipping(false);
        // Clear status after a short delay
        setTimeout(() => setTipStatus(null), 2000);
    }
  }, [canTip, authorNpub, auth, wallet, currentNoteId, ndkInstance, isNdkReady]);

  // --- Keyboard Handler for Tipping ---
  const handleAuthorKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') { // OK/Select button
        event.preventDefault();
        if (canTip) {
            handleTip();
        }
    }
    // Allow arrow keys for navigation if needed, but prevent default if handled
    // if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
    //   // Handle focus movement elsewhere if needed
    // }
  };

  // --- Render Logic (Use isLoading prop) ---
  if (isLoading && !imageUrl) {
    // Show loading spinner/message while fetching
    return (
         <div className="relative w-full h-full bg-black flex flex-col items-center justify-center overflow-hidden text-center">
           {/* SVG Spinner */}
           <svg className="animate-spin -ml-1 mr-3 h-10 w-10 text-purple-500 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
             <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
             <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
           </svg>
           <p className="text-gray-400 text-lg animate-pulse">
             {loadingMessages[loadingMessageIndex]}
           </p>
         </div>
    );
  }
  
  // Handle case where loading is false but notes are empty
  if (!imageNotes || imageNotes.length === 0) {
     return (
      <div className="w-full h-full flex items-center justify-center text-gray-400">
        No images found for selected authors.
      </div>
    );
  }

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-black overflow-hidden">
      {isLoading && !imageUrl && (
        <p className="text-gray-400">Loading images...</p>
      )}

      <AnimatePresence initial={false} mode="wait">
        {imageUrl ? (
          <motion.img
            key={imageUrl}
            src={imageUrl}
            alt={`Nostr post ${currentImageNote?.id || 'image'}`}
            className="block max-w-full max-h-full object-contain select-none"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
            onError={(e: React.SyntheticEvent<HTMLImageElement, Event>) => {
                console.error(`ImageFeed: Error loading image ${imageUrl}`, e);
            }}
          />
        ) : (
          <motion.div 
            key="no-image-placeholder"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="w-full h-full flex items-center justify-center text-gray-500"
          >
            {!isLoading && imageNotes.length > 0 && (
                <span>Image URL missing for note {currentNoteId}</span>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Author/Tip Info Overlay */}
      {currentImageNote && !isFullScreen && (
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ duration: 0.2 }}
                ref={authorContainerRef} 
                tabIndex={canTip ? 0 : -1} 
                onKeyDown={handleAuthorKeyDown}
                aria-label={`Post by ${displayName}. ${canTip ? 'Press OK to tip.' : ''}`}
                className={`absolute bottom-4 left-4 z-20 p-2 max-w-[calc(100%-150px)] bg-black/70 rounded-lg backdrop-blur-sm cursor-pointer ${canTip ? 'focus:outline-none focus:ring-2 focus:ring-yellow-400 hover:bg-black/80' : 'cursor-default'} transition-all`}
                onClick={canTip ? handleTip : undefined}
            >
                <div className="flex items-center">
                    {/* Avatar */} 
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-600 overflow-hidden mr-2">
                        {profile?.picture ? (
                            <img src={profile.picture} alt={displayName} className="w-full h-full object-cover" />
                        ) : (
                            <span className="text-gray-300 text-xs font-semibold flex items-center justify-center h-full uppercase">
                                {displayName?.substring(0, 2) || '??'}
                            </span>
                        )}
                    </div>
                    {/* Name & Timestamp */}
                    <div className="flex flex-col min-w-0">
                        <p className="text-sm font-semibold text-white truncate" title={displayName}>{displayName}</p>
                        <p className="text-xs text-gray-400 truncate" title={timestamp}>{timestamp}</p>
                    </div>
                    {/* Tip Button / Icon */} 
                    {canTip && !isTipping && tipStatus === null && (
                        <button 
                            onClick={handleTip} 
                            className="ml-3 p-1 rounded-full bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/40 hover:text-yellow-300 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-2 focus:ring-offset-black transition-colors"
                            aria-label={`Tip ${DEFAULT_TIP_AMOUNT} sats`}
                        >
                            <FiZap className="w-4 h-4" />
                        </button>
                    )}
                     {isTipping && (<span className="text-yellow-400 text-xs ml-2 animate-pulse">Zapping...</span>)}
                     {/* Display Tip Status */} 
                     {tipStatus === 'success' && <span className="text-green-400 text-xs ml-2">Tipped!⚡️</span>}
                     {tipStatus === 'error' && <span className="text-red-400 text-xs ml-2">Tip Failed!</span>}
                </div>
             </motion.div>
       )}

      {/* Hidden Toggle Button (Keep outside the info container) */}
      <button
        ref={toggleButtonRef}
        className="absolute opacity-0 pointer-events-none" // Make it truly hidden
        aria-hidden="true"
        tabIndex={-1} // Prevent tabbing
      >
        Focus Target
      </button>
    </div>
  );
});

export default ImageFeed; 