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
import { useWallet, SendTipParams } from '../hooks/useWallet'; // Import wallet hook and types
import { useAuth } from '../hooks/useAuth'; // Import auth hook for context
import { useMediaAuthors } from '../hooks/useMediaAuthors'; // Import useMediaAuthors to get NDK
import { FiZap } from 'react-icons/fi'; // Import Zap icon
// NDK type is needed for useMediaAuthors return type
import NDK from '@nostr-dev-kit/ndk'; 

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

  // Hooks
  const wallet = useWallet();
  // Pass undefined to useAuth if NDK is not needed directly or obtained elsewhere
  const auth = useAuth(undefined); 
  // Get NDK instance from useMediaAuthors - It expects no arguments
  const { ndk } = useMediaAuthors(); 
  const ndkInstance = ndk; // Assign to variable used in handleTip

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
  const currentImageNote = imageNotes && imageNotes.length > 0 && currentImageIndex >= 0
    ? imageNotes[currentImageIndex]
    : null;
  const imageUrl = currentImageNote?.url;
  // <<< Get profile data needed for display >>>
  const profile = currentImageNote?.posterPubkey ? profiles[currentImageNote.posterPubkey] : undefined;
  const displayName = profile?.name || profile?.displayName || currentImageNote?.posterPubkey?.substring(0, 10) || 'Anon';
  const timestamp = currentImageNote?.created_at ? new Date(currentImageNote.created_at * 1000).toLocaleString() : 'Date unknown';

  const currentNoteId = currentImageNote?.id;
  const canTip = !wallet.isLoadingWallet && !isTipping && wallet.balanceSats >= DEFAULT_TIP_AMOUNT && authorNpub && auth.isLoggedIn && !!ndkInstance;

  // --- Tipping Handler ---
  const handleTip = useCallback(async () => {
    if (!canTip || !authorNpub || !ndkInstance || !auth ) {
        console.warn('Cannot tip:', { canTip, authorNpub, ndkInstance, auth });
        return;
    }

    setIsTipping(true);
    setTipStatus(null);
    console.log(`Attempting to tip ${DEFAULT_TIP_AMOUNT} sats to ${authorNpub}`);

    const params: SendTipParams = {
        primaryRecipientNpub: authorNpub,
        amountSats: DEFAULT_TIP_AMOUNT,
        auth: auth, // Pass the auth object
        ndk: ndkInstance, // Pass the NDK instance
        eventIdToZap: currentNoteId, // Optional: pass current note ID
        comment: `📺⚡️ Tip from MadTrips TV App!` // Optional: Add a comment
    };

    try {
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
  }, [canTip, authorNpub, ndkInstance, auth, wallet, currentNoteId]);

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
            key={imageUrl} // Keyed by URL for transition
            src={imageUrl}
            alt={`Nostr post ${currentImageNote?.id || 'image'}`}
            className="block max-w-full max-h-full object-contain select-none" // Ensure it scales within bounds
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.4, ease: 'easeInOut' }}
            onError={() => console.error(`ImageFeed: Failed to load image ${imageUrl}`)}
            style={{ imageRendering: 'pixelated' }} // Optional: For pixel art
          />
        ) : !isLoading && (
          <p className="text-gray-500">No image found or failed to load.</p>
        )}
      </AnimatePresence>

      {/* --- Grouped Author Info Container (with Tipping interaction) --- */}
      {authorNpub && (
        <div
          ref={authorContainerRef}
          className={`absolute bottom-2 right-2 z-20 flex flex-col items-center space-y-0.5 transition-all duration-200 ease-in-out 
                       ${canTip ? 'cursor-pointer focus:outline-none focus:ring-4 focus:ring-purple-600 focus:ring-opacity-75 rounded-lg p-1 bg-black/30' : 'p-1'}`}
          tabIndex={canTip ? 0 : -1} // Make focusable only when tipping is possible
          onKeyDown={handleAuthorKeyDown}
          title={canTip ? `Press OK to tip ${DEFAULT_TIP_AMOUNT} sats` : displayName}
        >
          {/* Author Name */} 
          {currentImageNote && (
            <p className="text-xs text-purple-500 bg-black/40 px-1.5 py-0.5 rounded pointer-events-none truncate max-w-[120px] text-center">
              {displayName}
            </p>
          )}

          {/* Author QR Code + Overlays */} 
          <div className="relative bg-white p-1 rounded-sm shadow-md w-12 h-12 md:w-16 md:h-16 lg:w-18 lg:h-18">
              {/* QR Code itself */}
              <QRCode
                  value={authorNpub}
                  size={256}
                  style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                  viewBox={`0 0 256 256`}
                  level="H" // High error correction crucial for overlays
                  bgColor="#FFFFFF"
                  fgColor="#000000"
              />

              {/* --- Overlays Container --- */} 
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  
                  {/* Custom Logged-in Icon (Always shown when logged in) */} 
                  {auth.isLoggedIn && (
                      <div className="absolute w-1/3 h-1/3 opacity-80">
                         <CustomLoggedInIcon />
                      </div>
                  )}

                  {/* Tip possible indicator (Zap icon) */} 
                  {canTip && !isTipping && (
                      // Position the Zap icon; it might overlap the custom icon or be offset
                      <div className="absolute inset-0 flex items-center justify-center bg-black/10 rounded-sm">
                           <FiZap className="w-3/5 h-3/5 text-yellow-400 opacity-90 filter drop-shadow(0 1px 1px rgba(0,0,0,0.7))" />
                      </div>
                  )}
              </div>

               {/* --- Tipping Status Overlays (Should cover everything else) --- */} 
               {/* Use a separate container or ensure higher z-index if needed */} 
               <div className="absolute inset-0 pointer-events-none"> 
                 <AnimatePresence>
                   {isTipping && (
                       <motion.div /* Loading Spinner Overlay */
                            key="tipping"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-sm"
                       >
                            <svg className="animate-spin h-6 w-6 text-purple-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                       </motion.div>
                   )}
                   {tipStatus === 'success' && (
                        <motion.div /* Success Checkmark Overlay */
                            key="success"
                            initial={{ scale: 0.5, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.5, opacity: 0 }}
                            className="absolute inset-0 flex items-center justify-center bg-green-600/80 rounded-sm"
                        >
                            <svg className="h-8 w-8 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        </motion.div>
                    )}
                    {tipStatus === 'error' && (
                        <motion.div /* Error X Overlay */
                            key="error"
                            initial={{ x: -10, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            exit={{ x: 10, opacity: 0 }}
                            className="absolute inset-0 flex items-center justify-center bg-red-600/80 rounded-sm"
                        >
                            <svg className="h-8 w-8 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </motion.div>
                    )}
                 </AnimatePresence>
               </div>
          </div>

          {/* Timestamp */} 
          {currentImageNote && (
            <p className="text-[10px] text-purple-500 bg-black/40 px-1 py-0.5 rounded pointer-events-none text-center">
              {timestamp}
            </p>
          )}

        </div>
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