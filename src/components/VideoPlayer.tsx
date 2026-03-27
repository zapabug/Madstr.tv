import React, { useEffect, useRef } from 'react';
import QRCode from 'react-qr-code';
import { nip19 } from 'nostr-tools';
import { useProfileData } from '../hooks/useProfileData';
import { NostrNote } from '../types/nostr';
import NDK from '@nostr-dev-kit/ndk';

export interface VideoPlayerProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  src: string | null;
  isPlaying: boolean;
  togglePlayPause: () => void;
  authorNpub: string | null;
  isMuted: boolean;
  noteId: string | null;
  posterPubkey: string | null;
  ndkInstance?: NDK;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ 
  videoRef, 
  src,
  isPlaying,
  togglePlayPause,
  isMuted,
  noteId,
  posterPubkey,
  ndkInstance,
}) => {
  const playButtonRef = useRef<HTMLButtonElement>(null);

  const dummyNote: NostrNote | null = noteId && posterPubkey ? {
    id: noteId,
    pubkey: posterPubkey,
    created_at: 0,
    kind: 1,
    tags: [],
    content: '',
    sig: ''
  } : null;
  
  const { profiles } = useProfileData(dummyNote ? [dummyNote] : [], ndkInstance);

  const profile = posterPubkey ? profiles[posterPubkey] : undefined;
  const profilePicture = profile?.picture;

  const neventUri = noteId 
    ? `nostr:${nip19.neventEncode({ id: noteId })}`
    : null;

  const fallbackText = posterPubkey?.slice(-3).toUpperCase() || '???';

  useEffect(() => {
    if (videoRef.current && src) {
      console.log('VideoPlayer: Setting src to', src);
      if (!videoRef.current.paused) videoRef.current.pause();
      videoRef.current.src = src;
      videoRef.current.load();
    } else if (videoRef.current) {
       console.log('VideoPlayer: Clearing src');
       if (!videoRef.current.paused) videoRef.current.pause();
       videoRef.current.removeAttribute('src');
       videoRef.current.load();
    }
  }, [src, videoRef]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowUp' && !isPlaying) {
         event.preventDefault();
         playButtonRef.current?.focus();
     }
  };

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

      { !isPlaying && (
        <button 
          ref={playButtonRef}
          onClick={togglePlayPause}
          onKeyDown={handleKeyDown}
          tabIndex={0} 
          className="absolute p-3 z-10 bg-black bg-opacity-50 text-purple-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-2 focus:ring-offset-black transition-opacity duration-200 opacity-80 hover:opacity-100"
          aria-label="Play Video"
        >
          <svg className="w-12 h-12 lg:w-16 lg:h-16" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
          </svg>
        </button>
      )}

      {/* Profile image - top-left */}
      <div className="absolute top-2 left-2 z-20">
        <div className="w-12 h-12 rounded-full bg-gray-800 overflow-hidden">
          {profilePicture ? (
            <img src={profilePicture} alt="profile" className="w-full h-full object-cover" />
          ) : (
            <span className="text-sm font-bold text-gray-300 flex items-center justify-center h-full">
              {fallbackText}
            </span>
          )}
        </div>
      </div>

      {/* nevent QR - bottom-right, minimal styling */}
      {neventUri && (
        <div className="absolute bottom-2 right-2 z-20 w-12 h-12 md:w-16 md:h-16 lg:w-18 lg:h-18">
          <QRCode
            value={neventUri}
            size={0}
            style={{ width: "100%", height: "100%" }}
            bgColor="transparent"
            fgColor="#FFFFFF"
            level="M"
          />
        </div>
      )}
    </div>
  );
};

export default VideoPlayer;
