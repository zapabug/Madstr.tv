import React, { useRef, useEffect, useCallback, useState } from 'react';
// useNdk no longer needed here
// import { useNdk } from 'nostr-hooks'; 
// NDK types no longer needed here
// import { NDKEvent, NDKFilter, NDKKind } from '@nostr-dev-kit/ndk';
// nip19 potentially still needed if displaying npubs
import { nip19 } from 'nostr-tools'; 
import { NostrNote, NostrProfile } from '../types/nostr'; 
import { useProfileData } from '../hooks/useProfileData';

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

// Update props: remove authors, onNotesLoaded, add isLoading
export interface MediaFeedProps {
  // authors: string[]; // Removed
  isLoading: boolean; // Added
  handlePrevious: () => void;
  handleNext: () => void;
  currentImageIndex: number;
  imageNotes: NostrNote[]; 
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


const ImageFeed = React.forwardRef<ImageFeedRef, MediaFeedProps>((
  { 
    // authors, // Removed
    isLoading, // Added
    handlePrevious,
    handleNext,
    currentImageIndex,
    imageNotes, 
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

  // --- Render Logic (Use isLoading prop) ---
  if (isLoading) {
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

  const currentNote = imageNotes[currentImageIndex];
  // Handle case where index might be out of bounds briefly
  if (!currentNote) {
     return (
      <div className="w-full h-full flex items-center justify-center text-gray-400">
        Loading image data...
      </div>
    );
  }

  // Get profile using the pubkey from the NostrNote
  const profile = currentNote.posterPubkey ? profiles[currentNote.posterPubkey] : undefined;

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center overflow-hidden">
      {/* Image Display */}
      <div className="flex-grow w-full flex items-center justify-center overflow-hidden p-4">
        <img 
          key={currentNote.id} 
          src={currentNote.url || ''} 
          alt={`Nostr Event ${currentNote.id}`}
          className="max-w-full max-h-full object-contain transition-opacity duration-300 ease-in-out"
          onError={(e) => console.error(`Image source error for ${currentNote.id} (URL: ${currentNote.url}):`, e)}
        />
      </div>

      {/* Info Overlay */}
      <div className="absolute bottom-4 left-4 z-10 bg-black bg-opacity-60 p-2 rounded max-w-xs">
        <p className="text-xs text-gray-300 truncate">
          Posted by: {profile?.name || profile?.displayName || currentNote.posterPubkey?.substring(0,10)+'...' || 'Anon'}
        </p>
        <p className="text-xs text-gray-300">
          {new Date(currentNote.created_at * 1000).toLocaleString()}
        </p>
      </div>

      {/* Hidden Toggle Button (for focus target) */}
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