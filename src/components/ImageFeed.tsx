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
  authorProfilePictureUrl: string | null; // <<< Added >>>
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
    authorProfilePictureUrl, // <<< Destructure new prop >>>
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
  const timestamp = currentImageNote?.created_at ? new Date(currentImageNote.created_at * 1000).toLocaleDateString() : 'Date unknown';

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
    <div className="relative w-full h-full bg-black flex flex-col items-center justify-center overflow-hidden text-center">
      {/* Image Container with Animation */}
      <AnimatePresence initial={false} mode='wait'>
          <motion.div
            key={currentImageNote?.id} 
            className="absolute inset-0 flex items-center justify-center"
            initial={{ opacity: 0, scale: 0.9 }} // Start slightly scaled down and faded
            animate={{ opacity: 1, scale: 1 }}     // Animate to full size and opacity
            exit={{ opacity: 0, scale: 0.95 }}    // Exit by fading and slightly scaling down
            transition={{ duration: 0.5, ease: "easeInOut" }} // Smooth transition
          >
            <img
              id={`media-item-${currentImageNote?.id}`}
              src={imageUrl}
              alt={currentImageNote?.content || 'Nostr Image'}
              className="max-w-full max-h-full object-contain"
              onLoad={() => console.log("Image loaded:", imageUrl)} // Log image load
              onError={() => console.error("Error loading image:", imageUrl)} // Log image errors
            />
          </motion.div>
      </AnimatePresence>

      {/* Image Meta Info Overlay (Hide on Fullscreen) */}
      <AnimatePresence>
        {!isFullScreen && (
           <motion.div
             key="meta-overlay"
             initial={{ opacity: 0, y: 20 }}
             animate={{ opacity: 1, y: 0 }}
             exit={{ opacity: 0, y: 20 }}
             transition={{ duration: 0.3, delay: 0.2 }}
             className="absolute bottom-1 left-1 z-10 p-2 bg-black bg-opacity-70 rounded-lg text-left pointer-events-none text-xs"
           >
              {/* Author Info placeholder - can add author name/pic here later if desired */}
              {/* <p className="font-semibold text-purple-400 break-all" title={currentImageNote?.posterPubkey}>{displayName}</p> */}
              
              {/* Timestamp Display - Corrected */}
              <p className="text-gray-400 text-xs">{timestamp}</p>
           </motion.div>
         )
      }
      </AnimatePresence>

      {/* --- Grouped Author Info Container (with Tipping interaction) --- */}
      {/* Show only when not fullscreen */}
      <AnimatePresence>
        {authorNpub && (
          <motion.div
            key="author-qr-container"
            ref={authorContainerRef}
            className={`absolute bottom-2 right-2 z-20 flex flex-col items-center space-y-0.5 transition-all duration-200 ease-in-out
                        ${canTip ? 'cursor-pointer focus:outline-none focus:ring-4 focus:ring-purple-600 focus:ring-opacity-75 rounded-lg p-1 bg-black/30' : 'p-1 bg-black/40 rounded'}`}
            tabIndex={canTip ? 0 : -1}
            onKeyDown={handleAuthorKeyDown}
            title={canTip ? `Press OK to tip ${DEFAULT_TIP_AMOUNT} sats` : 'Image Author'}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.3 }}
          >
            {/* Author QR Code + Overlays */}
            <div className="relative bg-white p-1 rounded-sm shadow-md w-12 h-12 md:w-16 md:h-16 lg:w-18 lg:h-18">
                 <QRCode
                    value={`nostr:${authorNpub}`} // <<< Use nostr: prefix >>>
                    size={256}
                    style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                    viewBox={`0 0 256 256`}
                    level="H" // <<< Use Level H like VideoPlayer >>>
                    bgColor="#FFFFFF"
                    fgColor="#000000"
                 />
                 {/* --- Overlays Container --- */}
                 <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                     {auth.isLoggedIn && (
                         <div className="absolute w-1/3 h-1/3 opacity-80">
                             <CustomLoggedInIcon />
                         </div>
                     )}
                     {canTip && !isTipping && (
                         <div className="absolute inset-0 flex items-center justify-center bg-black/10 rounded-sm">
                             <FiZap className="w-3/5 h-3/5 text-yellow-400 opacity-90 filter drop-shadow(0 1px 1px rgba(0,0,0,0.7))" />
                         </div>
                     )}
                 </div>
                 {/* --- Tipping Status Overlays --- */} 
                 <div className="absolute inset-0 pointer-events-none">
                     <AnimatePresence>
                         {isTipping && (
                             <motion.div key="tipping" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-sm">
                                 <svg className="animate-spin h-6 w-6 text-purple-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                             </motion.div>
                         )}
                         {tipStatus === 'success' && (
                             <motion.div key="success" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }} className="absolute inset-0 flex items-center justify-center bg-green-600/80 rounded-sm">
                                 <svg className="h-8 w-8 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                             </motion.div>
                         )}
                         {tipStatus === 'error' && (
                             <motion.div key="error" initial={{ x: -10, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 10, opacity: 0 }} className="absolute inset-0 flex items-center justify-center bg-red-600/80 rounded-sm">
                                 <svg className="h-8 w-8 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                             </motion.div>
                         )}
                     </AnimatePresence>
                 </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
});

export default ImageFeed; 