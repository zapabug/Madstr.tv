import React, { useEffect, useRef } from 'react';
import QRCode from 'react-qr-code';

export interface VideoPlayerProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  src: string | null;
  isPlaying: boolean;
  togglePlayPause: () => void;
  authorNpub: string | null;
  autoplayFailed: boolean;
  isMuted: boolean;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ 
  videoRef, 
  src,
  isPlaying,
  togglePlayPause,
  authorNpub,
  autoplayFailed,
  isMuted
}) => {

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-black overflow-hidden">
      <video 
        ref={videoRef}
        className="max-w-full max-h-full object-contain"
        muted
        playsInline
      >
        Your browser does not support the video tag.
      </video>

      {/* Overlay Play/Pause Button - Show only if autoplay failed */}
      { autoplayFailed && (
        <button 
          onClick={togglePlayPause}
          tabIndex={0} 
          className="absolute p-3 z-10 bg-black bg-opacity-30 text-purple-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-2 focus:ring-offset-black transition-opacity duration-200 opacity-100 hover:opacity-90"
          aria-label="Play Video"
        >
          <svg className="w-12 h-12 lg:w-16 lg:h-16" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
          </svg>
        </button>
      )}

      {authorNpub && (
          <div className="absolute bottom-2 right-2 z-20 bg-white p-1 rounded-sm shadow-md w-12 h-12 md:w-16 md:h-16 lg:w-20 lg:h-20">
              <QRCode
                  value={authorNpub}
                  size={256}
                  style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                  viewBox={`0 0 256 256`}
                  level="L"
                  bgColor="#FFFFFF"
                  fgColor="#000000"
              />
          </div>
      )}

    </div>
  );
};

export default VideoPlayer; 