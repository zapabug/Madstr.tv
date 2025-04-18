import React, { useEffect, useRef, useState, useCallback } from 'react';
// import QRCode from 'react-qr-code'; // Removed QRCode import
import { motion, AnimatePresence } from 'framer-motion';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { useNdk, useProfile } from '@nostr-dev-kit/ndk-hooks'; // Use NDK hooks
import { useMediaElementPlayback } from '../hooks/useMediaElementPlayback';
import { VideoNote } from '../types/nostr';
import { useInactivityTimer } from '../hooks/useInactivityTimer';
import { useFocusManager } from '../hooks/useFocusManager';
import { NostrNote } from '../types/nostr';
import { formatTime } from '../utils/timeUtils';
import FullscreenButton from './shared/FullscreenButton';
import Slider from './shared/Slider';
// Remove unused wallet/auth/tipping related imports if tipping is removed
// import { useWallet, SendTipParams } from '../hooks/useWallet';
// import { useAuth } from '../hooks/useAuth';
// import { FiZap } from 'react-icons/fi';
// import NDK from '@nostr-dev-kit/ndk';

// Remove CustomLoggedInIcon if not used elsewhere after removing tipping section
/*
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
*/

export interface VideoPlayerProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  src: string | null;
  isPlaying: boolean;
  togglePlayPause: () => void;
  // authorNpub: string | null; // Removed prop
  autoplayFailed: boolean;
  isMuted: boolean;
  // currentNoteId?: string; // Removed prop (was only used for tipping)
}

// Remove DEFAULT_TIP_AMOUNT
// const DEFAULT_TIP_AMOUNT = 121; // Sats

const VideoPlayer: React.FC<VideoPlayerProps> = ({ 
  videoRef, 
  src,
  isPlaying,
  togglePlayPause,
  // authorNpub, // Removed from destructuring
  autoplayFailed,
  isMuted,
  // currentNoteId // Removed from destructuring
}) => {
  // Remove unused hooks and state related to tipping/author
  // const wallet = useWallet();
  // const auth = useAuth(undefined);
  // const { ndk } = useMediaAuthors();
  // const ndkInstance = ndk;
  // const [isTipping, setIsTipping] = useState(false);
  // const [tipStatus, setTipStatus] = useState<'success' | 'error' | null>(null);
  // const authorContainerRef = useRef<HTMLDivElement>(null);
  const playButtonRef = useRef<HTMLButtonElement>(null);
  const [isHoveringControls, setIsHoveringControls] = useState(false);
  const lastInteractionTime = useRef(Date.now());
  const { ndk, profile } = useNdkProfile(activeNote?.posterPubkey); // <<< Refactored NDK/Profile logic
  const [isFullscreen, setIsFullscreen] = useState(false);

  // --- Load video source when src changes ---
  useEffect(() => {
    if (videoRef.current && src) {
      console.log('VideoPlayer: Setting src to', src);
      videoRef.current.src = src;
      videoRef.current.load();
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
             });
         } else if (!isPlaying && !videoRef.current.paused) {
             videoRef.current.pause();
         }
     }
  }, [isPlaying, videoRef]);

  // --- Remove canTip calculation --- 
  // const canTip = ...;

  // --- Remove handleTip handler --- 
  // const handleTip = useCallback(async () => { ... });

  // --- Remove handleAuthorKeyDown handler --- 
  // const handleAuthorKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => { ... };

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-black overflow-hidden">
      <video 
        ref={videoRef as React.RefObject<HTMLVideoElement>}
        className="max-w-full max-h-full object-contain"
        muted={isMuted}
        playsInline
      >
        Your browser does not support the video tag.
      </video>

      {/* Overlay Play/Pause Button - Show only if autoplay failed */}
      { autoplayFailed && !isPlaying && (
        <button 
          ref={playButtonRef}
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

      {/* --- REMOVED Author Info / QR Code / Tipping Container --- */}
      {/* {authorNpub && ( ... )} */}

    </div>
  );
};

export default VideoPlayer; 