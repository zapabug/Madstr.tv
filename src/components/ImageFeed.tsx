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
      toggleButtonRef.current?.focus();
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

      {/* --- Grouped Author Info Container --- */}
      {authorNpub && (
        <div className="absolute bottom-2 right-2 z-20 flex flex-col items-center space-y-0.5"> {/* Main container */}
          
          {/* Author Name (Moved inside container) */}
          {currentImageNote && (
            <p 
              className="text-xs text-purple-500 bg-black/40 px-1.5 py-0.5 rounded pointer-events-none truncate max-w-[120px] text-center"
              title={displayName}
            >
              {displayName}
            </p>
          )}

          {/* Author QR Code (Moved inside container) */}
          <div className="bg-white p-1 rounded-sm shadow-md w-12 h-12 md:w-16 md:h-16 lg:w-18 lg:h-18"> {/* Removed absolute, slightly smaller max size */}
              <QRCode
                  value={authorNpub}
                  size={256} // Render high-res
                  style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                  viewBox={`0 0 256 256`}
                  level="L" // Lower error correction for denser code if needed
                  bgColor="#FFFFFF" // White background
                  fgColor="#000000" // Black foreground
              />
          </div>
          
          {/* Timestamp (Moved inside container) */}
          {currentImageNote && (
            <p 
              className="text-[10px] text-purple-500 bg-black/40 px-1 py-0.5 rounded pointer-events-none text-center"
            >
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