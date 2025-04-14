import React from 'react';

interface VideoPlayerProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  src: string | null;
  isPlaying: boolean;
  togglePlayPause: () => void;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ 
  videoRef, 
  src,
  isPlaying,
  togglePlayPause 
}) => {
  return (
    <div className="relative w-full h-full flex items-center justify-center bg-black">
      <video 
        ref={videoRef}
        src={src || ''} 
        className="max-w-full max-h-full object-contain" // Maintain aspect ratio within bounds
        autoPlay
        // controls // Optionally add native controls for debugging
      />
      {/* Play/Pause Button Overlay - Show when paused and src exists */}
      {!isPlaying && src && (
        <button 
          onClick={togglePlayPause}
          className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 text-white opacity-75 hover:opacity-100 focus:opacity-100 focus:outline-none transition-opacity"
          aria-label="Play Video"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-20 w-20 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
      )}
    </div>
  );
};

export default VideoPlayer; 