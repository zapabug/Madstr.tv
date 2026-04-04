import React, { useEffect, useRef, useMemo } from 'react';
import QRCode from 'react-qr-code';
import * as nip19 from 'nostr-tools/nip19';

export interface VideoPlayerProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  src: string | null;
  isPlaying: boolean;
  togglePlayPause: () => void;
  onPlay: () => void;
  authorNpub: string | null;
  isMuted: boolean;
  noteId: string | null;
  posterPubkey: string | null;
  profilePicture?: string | null;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({
  videoRef,
  src,
  isPlaying,
  togglePlayPause,
  onPlay,
  isMuted,
  noteId,
  posterPubkey,
  profilePicture,
}) => {
  const playButtonRef = useRef<HTMLButtonElement>(null);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowUp' && !isPlaying) {
         event.preventDefault();
         playButtonRef.current?.focus();
     }
  };

  // Generate nevent URI from noteId
  const neventUri = useMemo(() => {
    if (!noteId) return null;
    try {
      return `nostr:${nip19.neventEncode({ id: noteId })}`;
    } catch (e) {
      console.error('VideoPlayer: Failed to encode nevent:', e);
      return null;
    }
  }, [noteId]);

  // Generate fallback text from posterPubkey (last 3 chars)
  const fallbackText = posterPubkey ? posterPubkey.slice(-3).toUpperCase() : '???';

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
          onClick={onPlay}
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
    </div>
  );
};

export default VideoPlayer; 
