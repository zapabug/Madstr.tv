import React, { useRef, useState, useEffect } from 'react';
import QRCode from 'react-qr-code';

interface VideoPlayerProps {
  url: string | null;
  posterNpub: string | null;
  // Add other props as needed, e.g., eventId, createdAt for context?
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ url, posterNpub }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(true); // Assume attempting to play initially

  // Effect to handle play/pause based on state
  useEffect(() => {
    if (!videoRef.current) return;
    if (isPlaying) {
      // Attempt to play (may fail due to policies)
      videoRef.current.play().catch(error => {
        console.warn("Video play() failed:", error);
        setIsPlaying(false);
      });
    } else {
      videoRef.current.pause();
    }
  }, [isPlaying]);

  // Effect to attempt play when URL changes
  useEffect(() => {
    if (videoRef.current && url) {
        videoRef.current.load(); // Load new source
        // We want sound, ensure it's not muted from previous state if component wasn't remounted
        videoRef.current.muted = false; 
        setIsPlaying(true); // Attempt to play new source
    } else {
        setIsPlaying(false); // No URL, ensure paused
    }
  }, [url]);

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  if (!url) {
    return (
      <div className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden">
        <p className="text-gray-400">No video selected.</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-black flex flex-col items-center justify-center overflow-hidden">
      {/* Video Element - set muted={false} */}
      <video 
        ref={videoRef}
        key={url} 
        src={url}
        loop
        muted={false} // Attempt to play with sound
        // autoPlay // Let useEffect handle play attempt
        className={`object-contain w-full h-full`} 
        onError={(e) => console.error("Video source error:", e)}
      />

      {/* Simple Controls Overlay - Removed Mute Button */}
      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-10 flex space-x-4 bg-black bg-opacity-50 p-2 rounded">
        {/* Play/Pause Button */}
        <button 
            onClick={handlePlayPause} 
            className="p-1 bg-transparent border-none text-purple-400 hover:text-purple-200 focus:text-purple-200 focus:outline-none transition-colors duration-150"
            aria-label={isPlaying ? "Pause" : "Play"}
        >
            {/* SVG Icon */} 
             {isPlaying ? 
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> 
                : 
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            }
        </button>
        {/* Mute/Unmute Button Removed */}
      </div>

      {/* Restore QR Code */}
      {posterNpub && (
          <div className="absolute bottom-2 right-2 md:bottom-4 md:right-4 z-20 bg-white p-1 rounded w-12 h-12 md:w-16 md:h-16 lg:w-20 lg:h-20">
              <QRCode
              value={`nostr:${posterNpub}`}
              size={256}
              style={{ height: "auto", maxWidth: "100%", width: "100%" }}
              viewBox={`0 0 256 256`}
              level="L"
              />
          </div>
      )}
    </div>
  );
};

export default VideoPlayer; 