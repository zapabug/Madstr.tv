import React, { useEffect, useRef, useState, useCallback } from 'react';
import QRCode from 'react-qr-code';
import { motion, AnimatePresence } from 'framer-motion';
import { useWallet, SendTipParams } from '../hooks/useWallet';
import { useAuth } from '../hooks/useAuth';
import { useMediaAuthors } from '../hooks/useMediaAuthors';
import { FiZap } from 'react-icons/fi';
import NDK from '@nostr-dev-kit/ndk';

// Define your custom SVG component (same as in ImageFeed)
const CustomLoggedInIcon = () => (
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
    <path 
      d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" 
      fill="#8B5CF6" 
      stroke="#F7931A" 
      strokeWidth="1.5"
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
  </svg>
);

export interface VideoPlayerProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  src: string | null;
  isPlaying: boolean;
  togglePlayPause: () => void;
  authorNpub: string | null;
  autoplayFailed: boolean;
  isMuted: boolean;
  currentNoteId?: string; // Add currentNoteId as optional prop for tipping context
}

const DEFAULT_TIP_AMOUNT = 121; // Sats

const VideoPlayer: React.FC<VideoPlayerProps> = ({ 
  videoRef, 
  src,
  isPlaying,
  togglePlayPause,
  authorNpub,
  autoplayFailed,
  isMuted,
  currentNoteId // Destructure prop
}) => {
  const wallet = useWallet();
  const auth = useAuth(undefined);
  const { ndk } = useMediaAuthors();
  const ndkInstance = ndk;

  const [isTipping, setIsTipping] = useState(false);
  const [tipStatus, setTipStatus] = useState<'success' | 'error' | null>(null);
  const authorContainerRef = useRef<HTMLDivElement>(null);
  const playButtonRef = useRef<HTMLButtonElement>(null); // Ref for existing play button

  // --- Load video source when src changes ---
  useEffect(() => {
    if (videoRef.current && src) {
      console.log('VideoPlayer: Setting src to', src);
      videoRef.current.src = src;
      videoRef.current.load(); // Important to load the new source
    } else if (videoRef.current) {
       console.log('VideoPlayer: Clearing src');
       videoRef.current.removeAttribute('src');
       videoRef.current.load();
    }
  }, [src, videoRef]);

  // --- Handle Play/Pause based on isPlaying prop ---
  useEffect(() => {
     if (videoRef.current) {
         if (isPlaying && videoRef.current.paused) {
             videoRef.current.play().catch(error => {
                 console.error("Video play failed:", error);
                 // Autoplay failure is handled by autoplayFailed prop
             });
         } else if (!isPlaying && !videoRef.current.paused) {
             videoRef.current.pause();
         }
     }
  }, [isPlaying, videoRef]);

  // --- Calculate canTip --- 
  const canTip = !wallet.isLoadingWallet && !isTipping && wallet.balanceSats >= DEFAULT_TIP_AMOUNT && authorNpub && auth.isLoggedIn && !!ndkInstance;

  // --- Tipping Handler (Similar to ImageFeed) ---
  const handleTip = useCallback(async () => {
    if (!canTip || !authorNpub || !ndkInstance || !auth ) {
        console.warn('VideoPlayer: Cannot tip:', { canTip, authorNpub, ndkInstance, auth });
        return;
    }
    setIsTipping(true);
    setTipStatus(null);
    const params: SendTipParams = {
        primaryRecipientNpub: authorNpub,
        amountSats: DEFAULT_TIP_AMOUNT,
        auth: auth,
        ndk: ndkInstance,
        eventIdToZap: currentNoteId, // Use the passed note ID
        comment: `📺⚡️ Tip from MadTrips TV App (Video)!`
    };
    try {
        const success = await wallet.sendCashuTipWithSplits(params);
        setTipStatus(success ? 'success' : 'error');
    } catch (error) {
        console.error('VideoPlayer: Exception during tip:', error);
        setTipStatus('error');
    } finally {
        setIsTipping(false);
        setTimeout(() => setTipStatus(null), 2000);
    }
  }, [canTip, authorNpub, ndkInstance, auth, wallet, currentNoteId]);

  // --- Keyboard Handler for Tipping ---
  const handleAuthorKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (canTip) {
            handleTip();
        }
    }
    // Add basic focus management if needed
    // e.g., ArrowUp could focus the play button if visible
     if (event.key === 'ArrowUp' && playButtonRef.current && autoplayFailed) {
         event.preventDefault();
         playButtonRef.current.focus();
     }
  };

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-black overflow-hidden">
      <video 
        ref={videoRef}
        className="max-w-full max-h-full object-contain"
        muted={isMuted} // Control mute via prop
        playsInline
        // Removed controls attribute
        // Add event listeners if needed (onEnded, onTimeUpdate etc.)
      >
        Your browser does not support the video tag.
      </video>

      {/* Overlay Play/Pause Button - Show only if autoplay failed */}
      { autoplayFailed && !isPlaying && (
        <button 
          ref={playButtonRef} // Add ref
          onClick={togglePlayPause}
          tabIndex={0} 
          className="absolute p-3 z-10 bg-black bg-opacity-50 text-purple-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-2 focus:ring-offset-black transition-opacity duration-200 opacity-80 hover:opacity-100"
          aria-label="Play Video"
        >
          <svg className="w-12 h-12 lg:w-16 lg:h-16" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
          </svg>
        </button>
      )}

      {/* --- Grouped Author Info Container (with Tipping interaction) --- */}
      {authorNpub && (
        <div
          ref={authorContainerRef}
          className={`absolute bottom-2 right-2 z-20 flex flex-col items-center space-y-0.5 transition-all duration-200 ease-in-out 
                       ${canTip ? 'cursor-pointer focus:outline-none focus:ring-4 focus:ring-purple-600 focus:ring-opacity-75 rounded-lg p-1 bg-black/30' : 'p-1 bg-black/40 rounded'}`}
          tabIndex={canTip ? 0 : -1}
          onKeyDown={handleAuthorKeyDown}
          title={canTip ? `Press OK to tip ${DEFAULT_TIP_AMOUNT} sats` : 'Video Author'} // Simpler title
        >
          {/* Optional: Add Author Name if profile data is available */}
          {/* <p className="text-xs text-purple-500 bg-black/40 px-1.5 py-0.5 rounded pointer-events-none truncate max-w-[120px] text-center">{displayName}</p> */} 

          {/* Author QR Code + Overlays */} 
          <div className="relative bg-white p-1 rounded-sm shadow-md w-12 h-12 md:w-16 md:h-16 lg:w-18 lg:h-18">
              <QRCode
                  value={authorNpub}
                  size={256}
                  style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                  viewBox={`0 0 256 256`}
                  level="H"
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
                       <motion.div /* Loading Spinner */ key="tipping" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-sm">
                            <svg className="animate-spin h-6 w-6 text-purple-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                       </motion.div>
                   )}
                   {tipStatus === 'success' && (
                        <motion.div /* Success Check */ key="success" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }} className="absolute inset-0 flex items-center justify-center bg-green-600/80 rounded-sm">
                            <svg className="h-8 w-8 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        </motion.div>
                    )}
                    {tipStatus === 'error' && (
                        <motion.div /* Error X */ key="error" initial={{ x: -10, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 10, opacity: 0 }} className="absolute inset-0 flex items-center justify-center bg-red-600/80 rounded-sm">
                            <svg className="h-8 w-8 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </motion.div>
                    )}
                 </AnimatePresence>
               </div>
          </div>

          {/* Optional: Add Timestamp if available */}
          {/* <p className="text-[10px] text-purple-500 bg-black/40 px-1 py-0.5 rounded pointer-events-none text-center">{timestamp}</p> */} 
        </div>
      )}

    </div>
  );
};

export default VideoPlayer; 