import React, { useEffect, useRef, useState, useCallback } from 'react';
// import QRCode from 'react-qr-code'; // Removed QRCode import
import { motion, AnimatePresence } from 'framer-motion';
// import { NDKEvent } from '@nostr-dev-kit/ndk'; // Removed NDK import
// import { useNdk, useProfile } from '@nostr-dev-kit/ndk-hooks'; // Removed NDK hooks
import { useMediaElementPlayback } from '../hooks/useMediaElementPlayback';
// import { VideoNote } from '../types/nostr'; // Potentially unused if NostrNote is comprehensive
import { useInactivityTimer } from '../hooks/useInactivityTimer';
// import { useFocusManager } from '../hooks/useFocusManager'; // Commented out: File not found
import { NostrNote } from '../types/nostr'; // Assuming this contains author pubkey
// import { formatTime } from '../utils/timeUtils'; // Commented out: File not found
// import FullscreenButton from './shared/FullscreenButton'; // Commented out: Directory/File not found
// import Slider from './shared/Slider'; // Commented out: Directory not found

// Applesauce imports for profile fetching
import { Hooks } from 'applesauce-react';
import { ProfileQuery } from 'applesauce-core/queries'; 
import { ProfileContent } from 'applesauce-core/helpers';

// Remove unused wallet/auth/tipping related imports if tipping is removed
// import { useWallet, SendTipParams } from '../hooks/useWallet';
// import { useAuth } from '../hooks/useAuth';
// import { FiZap } from 'react-icons/fi';
// import NDK from '@nostr-dev-kit/ndk';

export interface VideoPlayerProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  src: string | null;
  isPlaying: boolean;
  togglePlayPause: () => void;
  authorPubkey: string | null; // Added prop for author's pubkey
  autoplayFailed: boolean;
  isMuted: boolean;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ 
  videoRef, 
  src,
  isPlaying,
  togglePlayPause,
  authorPubkey, // Destructure new prop
  autoplayFailed,
  isMuted,
}) => {
  const playButtonRef = useRef<HTMLButtonElement>(null);
  // const [isHoveringControls, setIsHoveringControls] = useState(false); // Seemingly unused
  // const lastInteractionTime = useRef(Date.now()); // Seemingly unused
  
  const profileData = Hooks.useStoreQuery(
    ProfileQuery,
    [authorPubkey ?? ''] 
  );
  const profile = profileData as ProfileContent | undefined;

  // const [isFullscreen, setIsFullscreen] = useState(false); // Seemingly unused, and FullscreenButton is not used

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

      {/* Overlay Play/Pause Button - Show only if autoplay failed or video is muted and not playing */}
      { (autoplayFailed || (isMuted && !isPlaying)) && !isPlaying && (
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

      {/* Display Author Info if profile is fetched */}
      {profile && (
        <div className="absolute bottom-2 left-2 bg-black/50 p-2 rounded-md text-white text-xs z-20">
          {profile.picture && (
            <img src={profile.picture} alt={profile.name || authorPubkey || 'author'} className="w-8 h-8 rounded-full inline-block mr-2" />
          )}
          <span>{profile.display_name || profile.name || authorPubkey?.substring(0,10)+'...'}</span>
        </div>
      )}

      {/* --- REMOVED Author Info / QR Code / Tipping Container --- */}

    </div>
  );
};

export default VideoPlayer; 