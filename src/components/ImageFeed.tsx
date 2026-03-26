import React, { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import { NostrNote } from '../types/nostr'; 
import { useProfileData } from '../hooks/useProfileData';
import { motion, AnimatePresence } from 'framer-motion';
import NDK from '@nostr-dev-kit/ndk';

export interface MediaFeedProps {
  isLoading: boolean;
  currentImageIndex: number;
  imageNotes: NostrNote[]; 
  authorNpub: string | null;
  isPlaying: boolean;
  isFullScreen: boolean;
  ndkInstance: NDK | undefined;
}

export interface ImageFeedRef {
  focusToggleButton: () => void;
}

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

const ImageFeed = forwardRef<ImageFeedRef, MediaFeedProps>((props, ref) => {
  const { 
    isLoading,
    currentImageIndex,
    imageNotes, 
    authorNpub,
    isPlaying,
    isFullScreen,
    ndkInstance,
  } = props;

  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const toggleButtonRef = useRef<HTMLButtonElement>(null);
  const { profiles } = useProfileData(imageNotes, ndkInstance);

  useImperativeHandle(ref, () => ({
    focusToggleButton: () => {
      console.log("ImageFeed: focusing toggle button via handle");
      toggleButtonRef.current?.focus();
    }
  }));

  useEffect(() => {
    const intervalId = setInterval(() => {
      setLoadingMessageIndex(prevIndex => (prevIndex + 1) % loadingMessages.length);
    }, 2500); 
    return () => clearInterval(intervalId); 
  }, []);

  useEffect(() => {
    if (imageNotes.length > 0 && currentImageIndex < imageNotes.length) {
       const targetElement = document.getElementById(`media-item-${imageNotes[currentImageIndex]?.id}`);
       targetElement?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }
  }, [currentImageIndex, imageNotes]);

  const currentImageNote = imageNotes && imageNotes.length > 0 && currentImageIndex >= 0 && currentImageIndex < imageNotes.length
    ? imageNotes[currentImageIndex]
    : null;
  const imageUrl = currentImageNote?.url;
  const profile = currentImageNote?.posterPubkey ? profiles[currentImageNote.posterPubkey] : undefined;
  const displayName = profile?.name || profile?.displayName || currentImageNote?.posterPubkey?.substring(0, 10) || 'Anon';
  const timestamp = currentImageNote?.created_at ? new Date(currentImageNote.created_at * 1000).toLocaleString() : 'Date unknown';
  const currentNoteId = currentImageNote?.id;

  console.log("ImageFeed Render:", {
      isLoading,
      currentImageIndex,
      notesCount: imageNotes.length,
      currentNoteId,
      imageUrl,
      authorNpub,
      displayName,
      isPlaying
  });

  if (isLoading && !imageUrl) {
    return (
         <div className="relative w-full h-full bg-black flex flex-col items-center justify-center overflow-hidden text-center">
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

      {currentImageNote && !isFullScreen && (
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ duration: 0.2 }}
                className="absolute bottom-4 left-4 z-20 p-2 max-w-[calc(100%-150px)] bg-black/70 rounded-lg backdrop-blur-sm"
            >
                <div className="flex items-center">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-600 overflow-hidden mr-2">
                        {profile?.picture ? (
                            <img src={profile.picture} alt={displayName} className="w-full h-full object-cover" />
                        ) : (
                            <span className="text-gray-300 text-xs font-semibold flex items-center justify-center h-full uppercase">
                                {displayName?.substring(0, 2) || '??'}
                            </span>
                        )}
                    </div>
                    <div className="flex flex-col min-w-0">
                        <p className="text-sm font-semibold text-white truncate" title={displayName}>{displayName}</p>
                        <p className="text-xs text-gray-400 truncate" title={timestamp}>{timestamp}</p>
                    </div>
                </div>
             </motion.div>
       )}

      <button
        ref={toggleButtonRef}
        className="absolute opacity-0 pointer-events-none"
        aria-hidden="true"
        tabIndex={-1}
      >
        Focus Target
      </button>
    </div>
  );
});

export default ImageFeed; 
