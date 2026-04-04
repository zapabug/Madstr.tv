import React, { useRef, useEffect, useState, forwardRef, useImperativeHandle, useMemo } from 'react';
import { NostrNote } from '../types/nostr'; 
import { useProfileData } from '../hooks/useProfileData';
import { motion, AnimatePresence } from 'framer-motion';
import NDK from '@nostr-dev-kit/ndk';
import QRCode from 'react-qr-code';
import * as nip19 from 'nostr-tools/nip19';

export interface MediaFeedProps {
  isLoading: boolean;
  currentImageIndex: number;
  imageNotes: NostrNote[]; 
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
  const posterPubkey = currentImageNote?.posterPubkey || null;
  const profile = posterPubkey ? profiles[posterPubkey] : undefined;
  const profilePicture = profile?.picture;

  // Generate nevent URI from noteId
  const neventUri = useMemo(() => {
    if (!currentImageNote?.id) return null;
    try {
      return `nostr:${nip19.neventEncode({ id: currentImageNote.id })}`;
    } catch (e) {
      console.error('ImageFeed: Failed to encode nevent:', e);
      return null;
    }
  }, [currentImageNote?.id]);

  // Generate fallback text from posterPubkey (last 3 chars)
  const fallbackText = posterPubkey ? posterPubkey.slice(-3).toUpperCase() : '???';

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
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
        {/* Image Container */}
        <AnimatePresence mode="wait">
          <motion.div
             key={currentImageNote?.id || currentImageIndex} // Ensure key changes
            className="w-full h-full flex items-center justify-center"
          >
             {imageUrl ? (
                <img 
                    src={imageUrl} 
                    alt={`Nostr media ${currentImageNote?.id}`}
                    className="max-w-full max-h-full object-contain shadow-lg"
                    // loading="lazy" // Let the browser handle lazy loading if needed
                    onError={(e) => {
                        console.error(`ImageFeed: Error loading image ${imageUrl}`);
                        // Optionally handle image errors, e.g., show placeholder
                        (e.target as HTMLImageElement).style.display = 'none'; // Hide broken image
                    }}
                />
            ) : (
                <div className="text-gray-500">No Image Available</div>
            )}
          </motion.div>
        </AnimatePresence>

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
                <span>Image URL missing for note {currentImageNote?.id}</span>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top-left: Profile image */}
      {(profilePicture || posterPubkey) && (
        <div className="absolute top-2 left-2 z-20">
          <div className="w-12 h-12 rounded-full bg-gray-800 overflow-hidden border-2 border-black">
            {profilePicture ? (
              <img 
                src={profilePicture} 
                alt="Profile" 
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gray-700">
                <span className="text-white text-sm font-bold">{fallbackText}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bottom-right: nevent QR */}
      {neventUri && (
        <div className="absolute bottom-2 right-2 z-20">
          <QRCode
            value={neventUri}
            size={64}
            style={{ height: 'auto', width: '100%' }}
            viewBox={`0 0 256 256`}
            level="M"
            bgColor="transparent"
            fgColor="#FFFFFF"
          />
        </div>
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
};

export default ImageFeed; 
