// src/components/MediaPanel.tsx

import React, { useState, useEffect, useRef } from 'react';
import { useInactivityTimer } from '../hooks/useInactivityTimer';
import { useProfileData } from '../hooks/useProfileData';

// Define types for props - This will expand significantly
import { NostrNote } from '../types/nostr'; // Fixed import path

// --- Helper to format time (seconds) into MM:SS ---
const formatTime = (seconds: number): string => {
    if (isNaN(seconds) || !isFinite(seconds)) {
        return '00:00';
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    const formattedMinutes = String(minutes).padStart(2, '0');
    const formattedSeconds = String(remainingSeconds).padStart(2, '0');
    return `${formattedMinutes}:${formattedSeconds}`;
};

// --- Helper to parse duration string to seconds ---
const parseDuration = (duration: string): number => {
    const parts = duration.split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parseInt(duration) || 0;
};

// --- Skeleton Item Component ---
const SkeletonItem: React.FC = () => (
    <div className="flex items-center p-2 mb-1 rounded-md bg-gray-700 animate-pulse">
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-600 mr-2"></div>
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-600 mr-2"></div>
        <div className="flex-grow h-4 bg-gray-600 rounded"></div>
    </div>
);

// --- Export Props for the Unified Panel ---
export interface MediaPanelProps {
  viewMode: 'imagePodcast' | 'videoPlayer';
  setViewMode: (mode: 'imagePodcast' | 'videoPlayer') => void;
  
  audioNotes: NostrNote[];
  videoNotes: NostrNote[];
  isLoadingAudioNotes: boolean;
  isLoadingVideoNotes: boolean;
  
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number; 
  setPlaybackRate: (rate: number) => void;
  togglePlayPause: () => void;
  handleSeek: (event: React.ChangeEvent<HTMLInputElement>) => void;

  currentAudioIndex: number;
  setCurrentAudioIndex: (index: number) => void;
  currentVideoIndex: number;
  onVideoSelect: (note: NostrNote, index: number) => void; 

  // Music filter state
  showMusicOnly: boolean;
  setShowMusicOnly: (show: boolean) => void;
}

// --- The Unified MediaPanel Component (Reverted) ---
const MediaPanel: React.FC<MediaPanelProps> = ({ 
    viewMode,
    setViewMode,
    audioNotes, 
    videoNotes,
    isLoadingAudioNotes,
    isLoadingVideoNotes,
    isPlaying,
    currentTime,
    duration,
    playbackRate,
    setPlaybackRate,
    togglePlayPause,
    handleSeek,
    currentAudioIndex,
    setCurrentAudioIndex,
    currentVideoIndex,
    onVideoSelect,
    showMusicOnly,
    setShowMusicOnly,
}) => {

  const [isSpeedMenuOpen, setIsSpeedMenuOpen] = useState(false);
  
  // Duration threshold for music vs podcast (6 minutes)
  const MUSIC_DURATION_THRESHOLD = 360;

  // Determine current notes and loading state based on viewMode
  // In audio mode, filter by music if showMusicOnly is true
  const filteredAudioNotes = showMusicOnly 
    ? audioNotes.filter(note => !note.duration || parseDuration(note.duration) < MUSIC_DURATION_THRESHOLD)
    : audioNotes;
  const notes = viewMode === 'imagePodcast' ? filteredAudioNotes : videoNotes;
  const isLoadingNotes = viewMode === 'imagePodcast' ? isLoadingAudioNotes : isLoadingVideoNotes;
  const currentItemIndex = viewMode === 'imagePodcast' ? currentAudioIndex : currentVideoIndex;

  // Combine notes for profile fetching (using derived 'notes')
  const { profiles } = useProfileData(notes);

  // --- Refs --- 
  const scrollableListRef = useRef<HTMLDivElement>(null);
  const listItemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const speedMenuRef = useRef<HTMLDivElement>(null);
  const speedButtonRef = useRef<HTMLButtonElement>(null);
  const playPauseButtonRef = useRef<HTMLButtonElement>(null);
  const progressBarRef = useRef<HTMLInputElement>(null);
  const mainContainerRef = useRef<HTMLDivElement>(null); 
  const toggleButtonRef = useRef<HTMLButtonElement>(null); // Mode Toggle Button

  // <<< Revert useInactivityTimer call >>>
  const [isInactive, resetInactivityTimer] = useInactivityTimer(45000);

  // --- Effects --- (Mostly unchanged, check dependencies)

  // Focus first list item on notes load (check viewMode dependency?)
  useEffect(() => {
    if (!isLoadingNotes && notes.length > 0 && listItemRefs.current[0]) {
        console.log(`MediaPanel: Focusing first list item in ${viewMode} mode.`);
        setTimeout(() => { 
            if (listItemRefs.current[0]) {
                 listItemRefs.current[0].focus();
            }
        }, 50);
    }
  }, [viewMode, notes, isLoadingNotes]); // Added viewMode dependency

  // Initialize/Resize list item refs when notes change (No change)
  useEffect(() => {
      listItemRefs.current = Array(notes.length).fill(null).map((_, i) => listItemRefs.current[i] || null);
  }, [notes]); 

  // Effect to close speed menu (No change)
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if ( isSpeedMenuOpen && speedMenuRef.current && !speedMenuRef.current.contains(event.target as Node) && speedButtonRef.current && !speedButtonRef.current.contains(event.target as Node) ) {
        setIsSpeedMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => { document.removeEventListener("mousedown", handleClickOutside); };
  }, [isSpeedMenuOpen]);

  // Effect for Inactivity Listeners (No change)
  useEffect(() => {
    const container = mainContainerRef.current; 
    if (!container) return;
    const handleActivity = () => resetInactivityTimer();
    const activityEvents: Array<keyof HTMLElementEventMap> = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'focus'];
    activityEvents.forEach(event => container.addEventListener(event, handleActivity, event === 'focus'));
    resetInactivityTimer();
    return () => {
      if (container) {
          activityEvents.forEach(event => container.removeEventListener(event, handleActivity, event === 'focus'));
      }
    };
  }, [resetInactivityTimer]);

  // --- Event Handlers ---

  const handleSpeedChange = (newRate: number) => {
      setPlaybackRate(newRate);
      setIsSpeedMenuOpen(false);
      speedButtonRef.current?.focus();
  };

  // --- Keyboard Handlers for Controls --- (Adjustments needed)

  const handlePlayPauseKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
          togglePlayPause(); 
          event.preventDefault(); return;
      }
      if (event.key === 'ArrowRight') {
          progressBarRef.current?.focus(); event.preventDefault(); return;
      }
      if (event.key === 'ArrowLeft') {
          // Speed button only relevant in image/audio mode?
          if (viewMode === 'imagePodcast') {
            speedButtonRef.current?.focus(); event.preventDefault(); return;
          } else {
            // Where to go left from Play/Pause in video mode? Maybe wrap to toggle button?
            toggleButtonRef.current?.focus(); event.preventDefault(); return;
          }
      }
      // Arrow Up might focus list item above
       if (event.key === 'ArrowUp') {
            const targetItem = listItemRefs.current[currentItemIndex] || listItemRefs.current[0];
            targetItem?.focus();
            event.preventDefault(); return;
       }
  };

  const handleSeekBarKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'ArrowLeft') {
         playPauseButtonRef.current?.focus(); event.preventDefault(); return; 
      }
      if (event.key === 'ArrowRight') {
          // Go to Speed button only if in image/audio mode
          if (viewMode === 'imagePodcast') {
             speedButtonRef.current?.focus(); event.preventDefault(); return;
          } else {
             // Go to Toggle button in video mode
             toggleButtonRef.current?.focus(); event.preventDefault(); return;
          }
      }
       if (event.key === 'ArrowUp') {
           const targetItem = listItemRefs.current[notes.length - 1] || listItemRefs.current[0];
           targetItem?.focus();
           event.preventDefault(); return;
       }
        if (event.key === 'ArrowDown') {
            // Focus play/pause button when pressing down from seekbar?
            playPauseButtonRef.current?.focus();
            event.preventDefault(); return;
       }
  };

  const handleSpeedButtonKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
      // This button is only enabled/visible in image/audio mode now
      if (viewMode !== 'imagePodcast') return; 
      
      if (event.key === 'Enter' || event.key === ' ') {
          setIsSpeedMenuOpen(prev => !prev);
          event.preventDefault(); return;
      }
      if (event.key === 'ArrowLeft') {
          progressBarRef.current?.focus(); event.preventDefault(); return;
      }
      if (event.key === 'ArrowRight') {
          toggleButtonRef.current?.focus(); event.preventDefault(); return;
      }
      // Arrow Up/Down could navigate list/controls
      if (event.key === 'ArrowUp') {
           const targetItem = listItemRefs.current[notes.length - 1] || listItemRefs.current[0];
           targetItem?.focus();
           event.preventDefault(); return;
      }
      if (event.key === 'ArrowDown') {
           playPauseButtonRef.current?.focus();
           event.preventDefault(); return;
      }
  };
  
  const handleToggleButtonKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
       if (event.key === 'Enter' || event.key === ' ') {
          setViewMode(viewMode === 'imagePodcast' ? 'videoPlayer' : 'imagePodcast'); 
          event.preventDefault(); return;
       }
       if (event.key === 'ArrowLeft') {
           // Go to Speed button (if image mode) or Seek bar (if video mode)
           if (viewMode === 'imagePodcast') {
              speedButtonRef.current?.focus(); event.preventDefault(); return;
           } else {
              progressBarRef.current?.focus(); event.preventDefault(); return;
           }
       }
       // Arrow Up/Down could navigate list/controls
        if (event.key === 'ArrowUp') {
           const targetItem = listItemRefs.current[notes.length - 1] || listItemRefs.current[0];
           targetItem?.focus();
           event.preventDefault(); return;
        }
       if (event.key === 'ArrowDown') {
           playPauseButtonRef.current?.focus();
           event.preventDefault(); return;
       }
       // Prevent default for ArrowRight (nowhere to go)
       if (event.key === 'ArrowRight') {
            event.preventDefault();
       }
  };

  // Generic handler for list items (Adjusted mode check)
  const handleItemKeyDown = (event: React.KeyboardEvent<HTMLDivElement>, note: NostrNote, index: number) => {
      console.log(`MediaPanel Item KeyDown: ${event.key} on index ${index} in mode ${viewMode}`);
      if (event.key === 'Enter' || event.key === ' ') {
          if (viewMode === 'imagePodcast') {
              console.log(`MediaPanel: Setting audio index to ${index}`);
              setCurrentAudioIndex(index);
          } else { // Video mode
              console.log(`MediaPanel: Selecting video index ${index}`);
              onVideoSelect(note, index); 
          }
          event.preventDefault();
      }
      // Down arrow from last item focuses Play/Pause button
      if (event.key === 'ArrowDown' && index === notes.length - 1) {
            playPauseButtonRef.current?.focus();
            event.preventDefault();
      }
      // Up arrow from first item might need specific handling if needed later
  };

  // --- Render Logic ---

  // Decide button text based on viewMode
  const toggleButtonText = viewMode === 'imagePodcast' ? 'Videos' : 'Images'; // Updated text
  const listAriaLabel = viewMode === 'imagePodcast' ? 'Podcast List' : 'Video List'; // Updated label
  const listEmptyText = viewMode === 'imagePodcast' ? 'No audio found.' : 'No videos found.';

  return (
    <div
      ref={mainContainerRef}
      className={`
        media-panel h-full w-full flex flex-col text-white
        bg-gray-800 bg-opacity-80 backdrop-blur-sm 
        p-2 
        rounded-lg 
        border border-slate-700
        transition-opacity duration-500 ease-in-out
        ${isInactive ? 'opacity-0' : 'opacity-100'}
      `}
      tabIndex={-1} // Make container focusable for inactivity detection
    >
      {/* --- REMOVE Video Player Area --- */}
      {/* {displayContext === 'main' && viewMode === 'videoPlayer' && currentItemUrl && ( ... video element ... )} */}

      {/* Scrollable List Area - Restoring inner border, keeping background */}
      <div
          ref={scrollableListRef}
          className={`flex-grow w-full overflow-y-auto rounded border border-slate-700 bg-slate-800`}
          aria-label={listAriaLabel} 
          role="listbox"
      >
        {isLoadingNotes ? (
            // ... Skeleton Loading State ...
            <>
                <SkeletonItem />
                <SkeletonItem />
                <SkeletonItem />
                <SkeletonItem />
            </>
        ) : notes.length === 0 ? (
             <div className='w-full h-full flex items-center justify-center'>
                <p className='text-gray-400 text-lg font-medium'>{listEmptyText}</p>
             </div>
        ) : (
            <>
                {/* Video Author Header - only in videoPlayer mode */}
                {viewMode === 'videoPlayer' && currentItemIndex < notes.length && notes[currentItemIndex] && (
                    <div className='px-2 py-1.5 bg-gray-800 border-b border-gray-700 text-xs text-purple-400 font-semibold truncate'>
                        {(() => {
                            const currentNote = notes[currentItemIndex];
                            const profile = currentNote.posterPubkey ? profiles[currentNote.posterPubkey] : undefined;
                            return profile?.name || profile?.displayName || currentNote.posterPubkey?.substring(0, 10) || 'Unknown Author';
                        })()}
                    </div>
                )}
                {/* Render actual list items based on derived 'notes' */}
                {notes.map((note, index) => {
                    const isImageMode = viewMode === 'imagePodcast';
                    const isSelected = index === currentItemIndex;

                    // Styling based on selection - Use consistent purple bg
                    let itemBg = 'bg-blue-800 bg-opacity-60 hover:bg-blue-700 hover:bg-opacity-80';
                    if (isSelected) {
                        itemBg = 'bg-purple-700 bg-opacity-70';
                    }
                    
                    // Profile Data lookup
                    const profile = note.posterPubkey ? profiles[note.posterPubkey] : undefined;
                    const itemDisplayName = profile?.name || profile?.displayName || note.posterPubkey?.slice(-4) || 'Anon';
                    const itemPictureUrl = profile?.picture;
                    const fallbackText = note.posterPubkey ? note.posterPubkey.slice(-3).toUpperCase() : '???';

                    return (
                        <div
                            key={note.id}
                            id={`media-item-${note.id}`}
                            ref={(el) => { listItemRefs.current[index] = el; }}
                            role="option"
                            aria-selected={isSelected}
                            tabIndex={0}
                            className={`flex items-center p-2 mb-1 rounded-md cursor-pointer transition-colors ${itemBg} focus:outline-none focus:ring-2 focus:ring-yellow-400`}
                            onClick={() => {
                               console.log(`MediaPanel Item Click: index ${index} in mode ${viewMode}`);
                               if (isImageMode) {
                                    setCurrentAudioIndex(index);
                               } else {
                                   onVideoSelect(note, index);
                               }
                            }}
                            onKeyDown={(e) => handleItemKeyDown(e, note, index)}
                            title={note.content || note.url}
                        >
                            {/* Profile Image */}
                            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-700 overflow-hidden mr-3">
                                {itemPictureUrl ? (
                                    <img 
                                        src={itemPictureUrl} 
                                        alt={itemDisplayName} 
                                        className="w-full h-full object-cover"
                                        onError={(e) => {
                                            (e.target as HTMLImageElement).style.display = 'none';
                                        }}
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                        <span className="text-xs font-bold text-gray-300">{fallbackText}</span>
                                    </div>
                                )}
                            </div>
                            <div className="flex-grow flex flex-col min-w-0">
                                <p className="text-sm text-white truncate font-medium" title={itemDisplayName}>
                                   {itemDisplayName} 
                                </p>
                            </div>
                        </div>
                    );
                })}
            </>
        )}
      </div>

      {/* REMOVED Media Elements Rendering - Keep Audio commented */}
      {/* {viewMode === 'image' && <audio ref={audioRef} />} */}
      {/* {viewMode === 'video' && <video ref={videoRef} key={...} src={...} className="hidden" />} */}
       
      {/* Playback Controls (Shared Structure) */}
      <div className={`w-full flex flex-row items-center justify-between bg-black rounded h-[60px] px-1`}> 
          
          {/* Play/Pause Button (Blue Background, Purple Icon) */}
          <button
            ref={playPauseButtonRef}
            onClick={togglePlayPause}
            onKeyDown={handlePlayPauseKeyDown}
            className={`
              flex-shrink-0 p-1 rounded-md 
              bg-blue-700 text-purple-500
              hover:bg-blue-600
              focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-1 focus:ring-offset-black 
              transition-colors duration-150
            `}
            aria-label={isPlaying ? "Pause" : "Play"}
            tabIndex={0}
          >
            {isPlaying ? (
              // Pause Icon (Simplified Path)
              <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" className="w-5 h-5">
                 <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
              </svg>
            ) : (
              // Play Icon (Triangle)
              <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} stroke="none" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
              </svg>
            )}
          </button>

          {/* Seek Bar Area - Only current time */}
          <div className="flex-grow flex items-center justify-center mx-2">
              <span className="text-xs text-gray-300 w-10 text-right mr-2 flex-shrink-0">{formatTime(currentTime)}</span>
              <input
                ref={progressBarRef}
                type="range"
                min={0}
                max={duration || 100}
                value={currentTime}
                onChange={handleSeek}
                className="w-full h-1 bg-purple-600 rounded-lg appearance-none cursor-pointer accent-purple-500 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-1 focus:ring-offset-black"
                aria-label="Seek through media"
                tabIndex={0} 
                disabled={!duration || duration <= 0} 
                onKeyDown={handleSeekBarKeyDown}
              />
          </div>

          {/* Right side buttons - Speed + Toggle */}
          <div className="flex-shrink-0 flex items-center gap-1">
            {/* Speed Button - Only in audio mode */}
            {viewMode === 'imagePodcast' && (
              <button
                ref={speedButtonRef}
                onClick={() => setIsSpeedMenuOpen(prev => !prev)} 
                onKeyDown={handleSpeedButtonKeyDown}
                className="p-1 text-purple-400 bg-purple-700 hover:bg-purple-600 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-1 focus:ring-offset-black transition-colors duration-150 text-xs"
                aria-label="Change playback speed"
                tabIndex={0}
              >
                 {playbackRate === 1 ? '1x' : playbackRate === 1.5 ? '1.5x' : playbackRate === 2 ? '2x' : `${playbackRate}x`}
              </button>
            )}
            {/* Speed Menu */}
            {isSpeedMenuOpen && (
              <div 
                ref={speedMenuRef}
                className="absolute bottom-full right-0 mb-1 w-16 bg-blue-800 shadow-lg rounded-md py-1 z-10 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-1 focus:ring-offset-black"
                role="menu" aria-label="Playback speed options"
              >
                {[2, 1.5, 1].map(rate => (
                  <button
                    key={rate}
                    onClick={() => handleSpeedChange(rate)}
                    className={`w-full text-left px-3 py-1 text-white hover:bg-blue-700 text-sm font-medium ${playbackRate === rate ? 'bg-purple-700' : ''}`}
                    role="menuitem" tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { handleSpeedChange(rate); e.preventDefault(); } }}
                  >
                    {rate}x
                  </button>
                ))}
              </div>
            )}

            {/* Toggle Button - Same styling in both modes */}
            <button
                ref={toggleButtonRef}
                onClick={() => viewMode === 'imagePodcast' ? setShowMusicOnly(!showMusicOnly) : setViewMode('imagePodcast')}
                onKeyDown={handleToggleButtonKeyDown}
                tabIndex={0}
                className={`flex-shrink-0 px-2 py-1 bg-blue-700 bg-opacity-80 rounded text-purple-300 hover:text-purple-100 hover:bg-blue-600 focus:text-purple-100 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-1 focus:ring-offset-black transition-all duration-150 text-xs font-semibold uppercase ${viewMode === 'imagePodcast' && showMusicOnly ? 'bg-purple-700' : ''}`}
                aria-label={viewMode === 'imagePodcast' ? (showMusicOnly ? 'Show all audio' : 'Show music only') : 'Show Images'}
                title={viewMode === 'imagePodcast' ? (showMusicOnly ? 'Show all audio' : 'Show music only') : 'Show Images'}
            >
                {viewMode === 'imagePodcast' ? (showMusicOnly ? 'All' : 'Music') : 'Images'}
            </button>
          </div>

      </div>

    </div>
  );
};

export default MediaPanel; 