import React, { useEffect, useRef, useState, useCallback } from 'react';
import QRCode from 'react-qr-code';
import { motion, AnimatePresence } from 'framer-motion';
import { useWallet, SendTipParams, UseWalletReturn } from '../hooks/useWallet';
import { useAuth, UseAuthReturn } from '../hooks/useAuth';
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
  videoRef: React.RefObject<HTMLVideoElement>;
  src: string | null;
  isPlaying: boolean;
  togglePlayPause: () => void;
  pause: () => void;
  play: () => void;
  toggleMute: () => void;
  authorNpub: string | null;
  autoplayFailed: boolean;
  isMuted: boolean;
  currentNoteId?: string;
  ndkInstance: NDK | null;
  isNdkReady: boolean;
  auth: UseAuthReturn;
  wallet: UseWalletReturn;
}

const DEFAULT_TIP_AMOUNT = 121; // Sats

const VideoPlayer: React.FC<VideoPlayerProps> = ({ 
  videoRef, 
  src,
  isPlaying,
  togglePlayPause,
  pause,
  play,
  toggleMute,
  authorNpub,
  autoplayFailed,
  isMuted,
  currentNoteId,
  ndkInstance,
  isNdkReady,
  auth,
  wallet 
}) => {
  const [isTipping, setIsTipping] = useState(false);
  const [tipStatus, setTipStatus] = useState<'success' | 'error' | null>(null);
  const authorContainerRef = useRef<HTMLDivElement>(null);
  const playButtonRef = useRef<HTMLButtonElement>(null);

  // --- Load video source when src changes ---
  useEffect(() => {
    if (videoRef.current && src) {
      console.log('VideoPlayer: Setting src to', src);
      if (!videoRef.current.paused) videoRef.current.pause();
      videoRef.current.src = src;
      videoRef.current.load(); // Important to load the new source
    } else if (videoRef.current) {
       console.log('VideoPlayer: Clearing src');
       if (!videoRef.current.paused) videoRef.current.pause();
       videoRef.current.removeAttribute('src');
       videoRef.current.load();
    }
  }, [src, videoRef]);

  // --- Calculate canTip --- 
  const canTip = isNdkReady && !wallet.isLoadingWallet && !isTipping && wallet.balanceSats >= DEFAULT_TIP_AMOUNT && authorNpub && auth.isLoggedIn && !!ndkInstance;

  // --- Tipping Handler (Similar to ImageFeed) ---
  const handleTip = useCallback(async () => {
    if (!canTip || !authorNpub || !ndkInstance || !auth ) {
        console.warn('VideoPlayer: Cannot tip:', { canTip, authorNpub, ndkInstanceExists: !!ndkInstance, authExists: !!auth });
        return;
    }
    setIsTipping(true);
    setTipStatus(null);
    const params: SendTipParams = {
        primaryRecipientNpub: authorNpub,
        amountSats: DEFAULT_TIP_AMOUNT,
        auth: auth,
        eventIdToZap: currentNoteId,
        comment: `📺⚡️ Tip from Mad⚡tr.tv TV App (Video)!`
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
    if (event.key === 'ArrowUp' && playButtonRef.current && !isPlaying) {
         event.preventDefault();
         playButtonRef.current.focus();
     }
  };

  // --- Conditional Click Handler for Overlay Button ---
  const handleOverlayButtonClick = useCallback(() => {
    // Action: Unmute and Play
    console.log("VideoPlayer: Overlay button clicked (when paused and muted). Unmuting and Playing.");
    toggleMute();
    play();
  }, [toggleMute, play]);
  // ----------------------------------------------------

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-black overflow-hidden">
      <video 
        ref={videoRef}
        className="max-w-full max-h-full object-contain"
        muted={isMuted}
        playsInline
      >
        Your browser does not support the video tag.
      </video>

      {/* Overlay Play/Pause Button - UPDATED Visibility and Logic */}
      { (!isPlaying && isMuted) && ( // <<< Show only if Paused AND Muted
        <button 
          ref={playButtonRef}
          onClick={handleOverlayButtonClick} // <-- Use updated handler
          tabIndex={0}
          className="absolute p-3 z-10 bg-black bg-opacity-50 text-purple-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-2 focus:ring-offset-black transition-opacity duration-200 opacity-80 hover:opacity-100"
          aria-label="Unmute and Play Video" // <-- Updated aria-label
        >
          {/* You might want a different icon here, like play + speaker? Keeping play icon for now. */}
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
          title={canTip ? `Press OK to tip ${DEFAULT_TIP_AMOUNT} sats` : 'Video Author'}
        >
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
        </div>
      )}

    </div>
  );
};

export default VideoPlayer; 