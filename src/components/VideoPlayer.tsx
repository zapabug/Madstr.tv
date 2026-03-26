import React, { useEffect, useRef } from 'react';
import QRCode from 'react-qr-code';
import { useAuth, UseAuthReturn } from '../hooks/useAuth';

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
  isMuted: boolean;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ 
  videoRef, 
  src,
  isPlaying,
  togglePlayPause,
  authorNpub,
  isMuted,
}) => {
  const auth = useAuth();
  const playButtonRef = useRef<HTMLButtonElement>(null);

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

      {authorNpub && (
        <div className="absolute bottom-2 right-2 z-20 flex flex-col items-center space-y-0.5 p-1 bg-black/40 rounded">
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
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  {auth.isLoggedIn && (
                      <div className="absolute w-1/3 h-1/3 opacity-80">
                         <CustomLoggedInIcon />
                      </div>
                  )}
              </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default VideoPlayer; 
