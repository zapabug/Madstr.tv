import React, { forwardRef, useImperativeHandle, useRef, useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import QRCode from 'react-qr-code';
import { nip19 } from 'nostr-tools';
import { NostrNote } from '../types/nostr';
// <<< Import context hooks >>>
import { useAuthContext } from '../context/AuthContext';
import { useWalletContext } from '../context/WalletContext';
// <<< Keep NDK import if needed for event creation, otherwise remove >>>
// import NDK from '@nostr-dev-kit/ndk';
import { TV_PUBKEY_NPUB } from '../constants'; // Keep if used for comparison or other logic

// Interface for props
interface MediaFeedProps {
  isLoading: boolean;
  handlePrevious: () => void;
  handleNext: () => void;
  currentImageIndex: number;
  imageNotes: NostrNote[];
  authorNpub: string | null;
  authorProfilePictureUrl: string | null;
  authorDisplayName: string | null;
  // Remove props provided by context
  // defaultTipAmount: number;
  // auth: any; // Replace with specific types if parts are needed
  // wallet: any; // Replace with specific types if parts are needed
  // Playback props (might be removable if only for status?)
  isPlaying: boolean;
  togglePlayPause: () => void;
  isFullScreen: boolean;
  signalInteraction: () => void;
}

// Interface for the ref
export interface ImageFeedRef {
  focusToggleButton: () => void;
}

// Helper to truncate npub
const truncateNpub = (npub: string | null): string => {
    if (!npub) return 'N/A';
    if (npub.length <= 15) return npub;
    return `${npub.substring(0, 10)}...${npub.substring(npub.length - 5)}`;
};

// Component definition using forwardRef
const ImageFeed = forwardRef<ImageFeedRef, MediaFeedProps>((
  {
    isLoading,
    handlePrevious,
    handleNext,
    currentImageIndex,
    imageNotes,
    authorNpub,
    authorProfilePictureUrl,
    authorDisplayName,
    isPlaying,
    togglePlayPause,
    isFullScreen,
    signalInteraction
  },
  ref
) => {

  // <<< Get auth and wallet state from context >>>
  const auth = useAuthContext();
  const wallet = useWalletContext();
  const { defaultTipAmount } = auth; // Get default tip amount from auth context

  const [showTipFeedback, setShowTipFeedback] = useState<'success' | 'error' | null>(null);
  const [tipErrorMsg, setTipErrorMsg] = useState<string | null>(null);
  const tipTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Ref for the mode toggle button
  const toggleButtonRef = useRef<HTMLButtonElement>(null);
  // Ref for the QR code button/div
  const qrCodeRef = useRef<HTMLDivElement>(null); // Ref the div containing the QR

  // Expose focusToggleButton via ref
  useImperativeHandle(ref, () => ({
    focusToggleButton: () => {
      toggleButtonRef.current?.focus();
    }
  }));

  const currentNote = imageNotes[currentImageIndex];
  const imageUrl = currentNote?.url;
  const displayAuthorName = authorDisplayName || truncateNpub(authorNpub);
  const timestamp = currentNote?.created_at ? new Date(currentNote.created_at * 1000).toLocaleString() : 'N/A';

  // --- Tipping Logic --- 
  const handleTipInteraction = useCallback(async () => {
    if (!authorNpub || !currentNote?.id || !auth.isLoggedIn || !wallet.sendCashuTipWithSplits) {
      console.log('ImageFeed: Cannot tip - missing author, note ID, auth, or wallet function.');
      return;
    }

    if (wallet.balanceSats < defaultTipAmount) {
      console.log('ImageFeed: Insufficient balance for default tip.');
      setTipErrorMsg(`Need ${defaultTipAmount} sats`);
      setShowTipFeedback('error');
      if (tipTimeoutRef.current) clearTimeout(tipTimeoutRef.current);
      tipTimeoutRef.current = setTimeout(() => setShowTipFeedback(null), 2500);
      return;
    }

    setShowTipFeedback(null); // Clear previous feedback
    setTipErrorMsg(null);
    // Consider adding a brief "Sending..." state?

    try {
        // Assume sendCashuTipWithSplits needs auth object, uses ndk internally
        const success = await wallet.sendCashuTipWithSplits({
            primaryRecipientNpub: authorNpub,
            amountSats: defaultTipAmount,
            auth: auth,
            eventIdToZap: currentNote.id,
        });

        if (success) {
            console.log(`ImageFeed: Successfully sent ${defaultTipAmount} sats tip to ${authorNpub}.`);
            setShowTipFeedback('success');
        } else {
            console.error(`ImageFeed: Failed to send tip (returned false) to ${authorNpub}.`);
            setTipErrorMsg(wallet.walletError || 'Tip Failed'); // Use error from wallet if available
            setShowTipFeedback('error');
        }
    } catch (error) {
        console.error(`ImageFeed: Error sending tip to ${authorNpub}:`, error);
        setTipErrorMsg(error instanceof Error ? error.message : String(error));
        setShowTipFeedback('error');
    } finally {
      // Clear feedback after a delay
      if (tipTimeoutRef.current) clearTimeout(tipTimeoutRef.current);
      tipTimeoutRef.current = setTimeout(() => setShowTipFeedback(null), 2500);
    }

  }, [authorNpub, currentNote, auth, wallet, defaultTipAmount]); // Added dependencies

  // Handle keyboard interaction (Enter/Space) on the QR code
  const handleQrKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      // signalInteraction(); // <<< REMOVE this line to prevent exiting fullscreen
      handleTipInteraction();
    }
  };

  // Clear timeout on unmount
  useEffect(() => {
    return () => {
      if (tipTimeoutRef.current) {
        clearTimeout(tipTimeoutRef.current);
      }
    };
  }, []);

  // Determine if tip cue should be shown
  const showTipCue = auth.isLoggedIn && wallet.balanceSats >= defaultTipAmount;

  // Handle loading state
  if (isLoading) {
    return <div className="text-gray-400">Loading Image...</div>;
  }

  // Handle no image URL
  if (!imageUrl) {
    return <div className="text-red-500">Error: Image URL not found for note.</div>;
  }

  // --- Render Component ---
  return (
    <div className="relative w-full h-full flex items-center justify-center bg-black">
      {/* Image Display */}
      <motion.img
        key={imageUrl} // Animate when imageUrl changes
        src={imageUrl}
        alt={`Nostr post by ${displayAuthorName}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.6 }}
        className="max-h-full max-w-full object-contain"
        onError={(e: React.SyntheticEvent<HTMLImageElement, Event>) => {
          console.error(`Failed to load image: ${imageUrl}`);
          (e.target as HTMLImageElement).src = '/placeholder-image.png'; // Use a local placeholder
        }}
      />

      {/* Info Overlay (Bottom Right, hide on fullscreen) */}
      {/* The outer motion.div is REMOVED for the QR code part */}
      {/* 
      {!isFullScreen && (
        <motion.div
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 50 }}
          transition={{ duration: 0.5 }}
          // className="absolute bottom-4 right-4 z-10 bg-black/60 backdrop-blur-sm p-3 rounded-lg shadow-lg max-w-xs text-right" // Removed positioning from here
          className="absolute bottom-4 right-4 z-10" // Keep absolute positioning container if needed, but content moves out
        >
           <div className="flex items-center justify-end mb-2">
             
             // QR Code USED TO BE HERE

             // Author Info - REMOVED
           </div>
        </motion.div>
      )}
      */}

      {/* QR Code (Focusable for Tipping - ALWAYS VISIBLE) */}
      <div 
          ref={qrCodeRef} 
          tabIndex={auth.isLoggedIn ? 0 : -1} // Only focusable when logged in
          // <<< ADDED Positioning >>>
          className={`absolute bottom-4 right-4 z-10 p-1 bg-white rounded shadow cursor-pointer transition-transform duration-150 ease-in-out 
                      ${auth.isLoggedIn ? 'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-black/50 focus:ring-yellow-400 hover:scale-105 active:scale-100' : 'opacity-50 cursor-not-allowed'}
                    `}
          onClick={auth.isLoggedIn ? handleTipInteraction : undefined} // Click handler
          onKeyDown={auth.isLoggedIn ? handleQrKeyDown : undefined} // Keyboard handler
          aria-label={auth.isLoggedIn ? `Tip ${defaultTipAmount} sats to ${displayAuthorName}` : "Login to tip"}
          title={auth.isLoggedIn ? `Tip ${defaultTipAmount} sats to ${displayAuthorName}` : "Login to tip"}
        >
          {authorNpub ? (
                <QRCode value={authorNpub} size={64} level="H" />
            ) : (
                <div className="w-16 h-16 bg-gray-700 flex items-center justify-center text-xs text-gray-400">N/A</div>
            )}
            {/* Tip Cue */}
            {showTipCue && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="text-3xl" style={{ textShadow: '0 0 5px rgba(255,255,255,0.7)' }}>⚡️</span>
              </div>
            )}
            {/* Tip Feedback Overlay */}
            {showTipFeedback === 'success' && (
              <div className="absolute inset-0 flex items-center justify-center bg-green-500/80 rounded">
                  <span className="text-3xl text-white">✅</span>
              </div>
            )}
            {showTipFeedback === 'error' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-600/90 rounded p-1">
                  <span className="text-2xl text-white animate-pulse">❌</span>
                  <span className="text-[10px] text-white font-semibold mt-0.5 leading-tight">{tipErrorMsg || 'Error'}</span>
              </div>
            )}
        </div>

    </div>
  );
});

export default ImageFeed;