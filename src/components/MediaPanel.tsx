// src/components/MediaPanel.tsx

import React, { useState, useEffect, useRef } from 'react';
import { useInactivityTimer } from '../hooks/useInactivityTimer';
// Removed: import { usePodcastNotes } from '../hooks/usePodcastNotes'; // Data will come via props
import { useProfileData } from '../hooks/useProfileData'; // Keep for profiles
import { useMediaElementPlayback } from '../hooks/useMediaElementPlayback'; // Keep for playback

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

// --- Skeleton Item Component ---
const SkeletonItem: React.FC = () => (
    <div className="flex items-center p-2 mb-1 rounded-md bg-gray-700 animate-pulse">
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-600 mr-2"></div>
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-600 mr-2"></div>
        <div className="flex-grow h-4 bg-gray-600 rounded"></div>
    </div>
);

// --- Export Props for the Unified Panel (Reverted) ---
export interface MediaPanelProps {
  // <<< Remove displayContext prop >>>
  // displayContext: 'main' | 'panel'; 

  // Refs passed from App 
  audioRef: React.RefObject<HTMLAudioElement | null>; 
  videoRef: React.RefObject<HTMLVideoElement | null>; 
  
  // Mode (Updated)
  viewMode: 'imagePodcast' | 'videoPlayer'; // <<< Use correct types
  setViewMode: (mode: 'imagePodcast' | 'videoPlayer') => void; // <<< Use correct types
  
  // Data
  podcastNotes: NostrNote[];
  videoNotes: NostrNote[];
  isLoadingPodcastNotes: boolean;
  isLoadingVideoNotes: boolean;
  
  // Playback State & Handlers (Passed down from App)
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number; 
  setPlaybackRate: (rate: number) => void;
  togglePlayPause: () => void;
  handleSeek: (event: React.ChangeEvent<HTMLInputElement>) => void;
  currentItemUrl: string | null; // <<< Added missing prop

  // Selection State & Handlers
  currentPodcastIndex: number;
  setCurrentPodcastIndex: (index: number) => void;
  currentVideoIndex: number;
  onVideoSelect: (note: NostrNote, index: number) => void; 

  // Profile Data
  authors: string[]; // <<< Added missing prop

  // Optional: For edge navigation (Potentially remove?)
  // handleLeft?: () => void; 
  // handleRight?: () => void;
  // onFocusRightEdge?: () => void; 

  // <<< Add signalInteraction prop >>>
  signalInteraction: () => void;
}

// --- The Unified MediaPanel Component (Reverted) ---
const MediaPanel: React.FC<MediaPanelProps> = ({ 
    // <<< Remove displayContext from destructuring >>>
    // displayContext,
    audioRef,
    videoRef,
    viewMode, // <<< Prop type updated in interface
    setViewMode, // <<< Prop type updated in interface
    podcastNotes, 
    videoNotes,
    isLoadingPodcastNotes,
    isLoadingVideoNotes,
    isPlaying,
    currentTime,
    duration,
    playbackRate,
    setPlaybackRate,
    togglePlayPause,
    handleSeek,
    currentItemUrl, // <<< Use added prop
    currentPodcastIndex,
    setCurrentPodcastIndex,
    currentVideoIndex,
    onVideoSelect,
    authors, // <<< Use added prop
    signalInteraction,
}) => {

  const [isSpeedMenuOpen, setIsSpeedMenuOpen] = useState(false);
  
  // Determine current notes and loading state based on viewMode
  const notes = viewMode === 'imagePodcast' ? podcastNotes : videoNotes;
  const isLoadingNotes = viewMode === 'imagePodcast' ? isLoadingPodcastNotes : isLoadingVideoNotes;
  const currentItemIndex = viewMode === 'imagePodcast' ? currentPodcastIndex : currentVideoIndex;

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
          // Speed button only relevant in image/podcast mode?
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
          // Go to Speed button only if in image/podcast mode
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
      // This button is only enabled/visible in image/podcast mode now
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
          if (viewMode === 'imagePodcast') { // Was podcast
              console.log(`MediaPanel: Setting podcast index to ${index}`);
              setCurrentPodcastIndex(index);
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
  const listEmptyText = viewMode === 'imagePodcast' ? 'No podcasts found.' : 'No videos found.'; // Updated text

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
            // Render actual list items based on derived 'notes'
            notes.map((note, index) => {
                const isImageMode = viewMode === 'imagePodcast'; // Was isPodcastMode
                const isSelected = index === currentItemIndex;

                // Styling based on selection - Use consistent purple bg
                let itemBg = 'bg-blue-800 bg-opacity-60 hover:bg-blue-700 hover:bg-opacity-80';
                if (isSelected) {
                    itemBg = 'bg-purple-700 bg-opacity-70'; // Always use purple when selected
                }
                
                // Profile Data lookup
                const profile = note.posterPubkey ? profiles[note.posterPubkey] : undefined;
                const itemDisplayName = profile?.name || profile?.displayName || note.posterPubkey?.substring(0, 10) || 'Anon';
                const itemPictureUrl = profile?.picture;

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
                               setCurrentPodcastIndex(index);
                           } else {
                               onVideoSelect(note, index);
                           }
                        }}
                        onKeyDown={(e) => handleItemKeyDown(e, note, index)}
                        title={note.content || note.url} // Basic title
                    >
                        {/* Item Content (No change needed) */}
                        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-700 flex items-center justify-center mr-2">
                            <span className="text-xs font-semibold text-white">{notes.length - index}</span> 
                        </div>
                        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 overflow-hidden mr-2">
                             {itemPictureUrl ? (
                                <img src={itemPictureUrl} alt={itemDisplayName} className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-gray-300 text-xs font-semibold flex items-center justify-center h-full uppercase">{itemDisplayName.substring(0, 1)}</span>
                            )}
                        </div>
                        <div className="flex-grow flex flex-col">
                            <p className="text-sm text-white truncate" title={itemDisplayName}>
                               {itemDisplayName} 
                            </p>
                        </div>
                    </div>
                );
            })
        )}
      </div> 

      {/* REMOVED Media Elements Rendering - Keep Audio commented */}
      {/* {viewMode === 'image' && <audio ref={audioRef} />} */}
      {/* {viewMode === 'video' && <video ref={videoRef} key={...} src={...} className="hidden" />} */}
       
      {/* Playback Controls (Shared Structure) - Removed p-1 */}
      <div className={`w-full flex flex-row items-center justify-between bg-black rounded h-[60px]`}> 
          
          {/* Play/Pause Button (Blue Background, Purple Icon) */}
          <button
            ref={playPauseButtonRef}
            onClick={togglePlayPause} // Use prop handler
            onKeyDown={handlePlayPauseKeyDown}
            className={`
              flex-shrink-0 p-1 rounded-md 
              bg-blue-700 text-purple-500 // Use blue background, purple icon
              hover:bg-blue-600 // Darken blue on hover
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

          {/* Seek Bar Area (No change) */}
          <div className="flex-grow flex items-center justify-center mx-2">
              <span className="text-xs text-gray-300 w-10 text-right mr-2 flex-shrink-0">{formatTime(currentTime)}</span>
              <input
                ref={progressBarRef}
                type="range"
                min={0}
                max={duration || 100}
                value={currentTime}
                onChange={handleSeek} // Use prop handler
                className="w-full h-1 bg-purple-600 rounded-lg appearance-none cursor-pointer accent-purple-500 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-1 focus:ring-offset-black"
                aria-label="Seek through media"
                tabIndex={0} 
                disabled={!duration || duration <= 0} 
                onKeyDown={handleSeekBarKeyDown}
              />
              <span className="text-xs text-gray-300 w-10 text-left ml-2 flex-shrink-0">{formatTime(duration)}</span>
          </div>

          {/* Speed Button Area (Conditionally render based on viewMode) */}
          <div className="relative flex-shrink-0 mr-1"> 
              {viewMode === 'imagePodcast' && ( // Only show speed controls in image/podcast mode
                 <>
                  <button
                    ref={speedButtonRef}
                    onClick={() => setIsSpeedMenuOpen(prev => !prev)} 
                    onKeyDown={handleSpeedButtonKeyDown}
                    className="p-1 text-purple-400 bg-purple-700 hover:bg-purple-600 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-1 focus:ring-offset-black transition-colors duration-150 text-xs"
                    aria-label="Change playback speed"
                    tabIndex={0}
                  >
                     {playbackRate.toFixed(2)}x
                  </button>
                  {/* Speed Menu */}
                  {isSpeedMenuOpen && (
                    <div 
                      ref={speedMenuRef}
                      className="absolute bottom-full right-0 mb-1 w-24 bg-blue-800 shadow-lg rounded-md py-1 z-10 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-1 focus:ring-offset-black"
                      role="menu" aria-label="Playback speed options"
                    >
                      {[2.0, 1.75, 1.5, 1.25, 1.0, 0.75].map(rate => (
                        <button
                          key={rate}
                          onClick={() => handleSpeedChange(rate)}
                          className={`w-full text-left px-3 py-1 text-white hover:bg-blue-700 text-xs ${playbackRate === rate ? 'font-bold' : ''}`}
                          role="menuitem" tabIndex={0}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { handleSpeedChange(rate); e.preventDefault(); } }}
                        >
                          {rate.toFixed(2)}x
                        </button>
                      ))}
                    </div>
                  )}
                 </>
              )}
          </div>

            {/* Mode Toggle Button (Updated onClick) */}
             <button
                 ref={toggleButtonRef}
                 onClick={() => setViewMode(viewMode === 'imagePodcast' ? 'videoPlayer' : 'imagePodcast')} // Use prop handler
                 onKeyDown={handleToggleButtonKeyDown}
                 tabIndex={0}
                 className="flex-shrink-0 p-1 bg-blue-700 bg-opacity-80 rounded text-purple-300 hover:text-purple-100 hover:bg-blue-600 focus:text-purple-100 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-1 focus:ring-offset-black transition-all duration-150 text-xs font-semibold uppercase"
                 aria-label={`Show ${toggleButtonText}`}
                 title={`Show ${toggleButtonText}`}
             >
                 {toggleButtonText}
             </button>

      </div> 

    </div>
  );
};

export default MediaPanel; 