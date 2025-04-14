// src/components/Podcastr.tsx

import React, { useState, useEffect, useRef } from 'react';
import { useInactivityTimer } from '../hooks/useInactivityTimer';
import { usePodcastNotes } from '../hooks/usePodcastNotes';
import { useProfileData } from '../hooks/useProfileData';
import { useAudioPlayback } from '../hooks/useAudioPlayback';

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

interface PodcastPlayerProps {
  authors: string[];
  handleLeft?: () => void;
  handleRight?: () => void;
}

const Podcastr: React.FC<PodcastPlayerProps> = ({ authors, handleLeft, handleRight }) => {
  const [currentItemIndex, setCurrentItemIndex] = useState(0);
  const [focusedItemIndex, setFocusedItemIndex] = useState(0);
  const [isSpeedMenuOpen, setIsSpeedMenuOpen] = useState(false);

  // --- Refs ---
  const audioRef = useRef<HTMLAudioElement>(null);
  const scrollableListRef = useRef<HTMLDivElement>(null);
  const listItemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const speedMenuRef = useRef<HTMLDivElement>(null);
  const speedButtonRef = useRef<HTMLButtonElement>(null);
  const playPauseButtonRef = useRef<HTMLButtonElement>(null);
  const progressBarRef = useRef<HTMLInputElement>(null);
  const mainContainerRef = useRef<HTMLDivElement>(null); // <<< Declaration >>>

  // --- Custom Hooks ---
  const { notes, isLoading: isLoadingNotes } = usePodcastNotes(authors);
  const { profiles } = useProfileData(notes);
  // Get the current item based on the index *after* notes have loaded
  const currentItem = !isLoadingNotes && notes.length > currentItemIndex ? notes[currentItemIndex] : null;
  const {
    isPlaying,
    currentTime,
    duration,
    playbackRate,
    setPlaybackRate,
    togglePlayPause,
    handleSeek
  } = useAudioPlayback({ audioRef, currentItemUrl: currentItem?.url || null });
  const [isInactive, resetInactivityTimer] = useInactivityTimer(45000);

  // --- Effects ---

  // Initialize/Resize list item refs when notes change
  useEffect(() => {
      listItemRefs.current = Array(notes.length).fill(null).map((_, i) => listItemRefs.current[i] || null);
  }, [notes]);

  // Reset focus/selection when notes list changes (e.g., author selection changes)
  useEffect(() => {
    // Check if notes array identity has changed or length is 0 to avoid unnecessary resets
    setCurrentItemIndex(0);
    setFocusedItemIndex(0);
  }, [notes]); // Depend on notes array identity

  // Effect to close speed menu if clicked outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        isSpeedMenuOpen &&
        speedMenuRef.current && 
        !speedMenuRef.current.contains(event.target as Node) &&
        speedButtonRef.current &&
        !speedButtonRef.current.contains(event.target as Node)
      ) {
        setIsSpeedMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isSpeedMenuOpen]);

  // Effect to scroll focused item into view
  useEffect(() => {
    // Ensure notes exist and index is valid before scrolling
    if (notes.length > 0 && focusedItemIndex >= 0 && focusedItemIndex < listItemRefs.current.length && listItemRefs.current[focusedItemIndex]) {
        listItemRefs.current[focusedItemIndex]?.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
        });
    }
  }, [focusedItemIndex, notes.length]);

  // Effect for Initial Focus on the list - modified to be less aggressive
  useEffect(() => {
      if (!isLoadingNotes && notes.length > 0) {
          const validIndex = Math.max(0, Math.min(focusedItemIndex, notes.length - 1));
          if (focusedItemIndex !== validIndex) {
              setFocusedItemIndex(validIndex); // Ensure index is valid
          }
          // Do not automatically set focus to avoid trapping the user
          // Focus will be set only if explicitly needed (e.g., on first load or user interaction)
      }
  }, [isLoadingNotes, notes.length, focusedItemIndex]);

  // Effect for Inactivity Listeners
  useEffect(() => {
    const container = mainContainerRef.current; // <<< Usage 1 >>>
    if (!container) return;
    const handleActivity = () => resetInactivityTimer();
    const activityEvents: Array<keyof HTMLElementEventMap> = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'focus'];
    activityEvents.forEach(event => container.addEventListener(event, handleActivity, event === 'focus'));
    resetInactivityTimer();
    return () => {
      activityEvents.forEach(event => {
          if (container) {
             container.removeEventListener(event, handleActivity, event === 'focus');
          }
      });
    };
  }, [resetInactivityTimer]);

  // --- Event Handlers ---

  const handleSpeedChange = (newRate: number) => {
      setPlaybackRate(newRate);
      setIsSpeedMenuOpen(false);
  };

  const handleListKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (notes.length === 0) return;
      let newIndex = focusedItemIndex;
      switch (event.key) {
          case 'ArrowUp':
              if (focusedItemIndex > 0) {
                newIndex = Math.max(0, focusedItemIndex - 1);
                event.preventDefault();
              } else {
                // At the top, allow focus to move out naturally
                return;
              }
              break;
          case 'ArrowDown':
              if (focusedItemIndex < notes.length - 1) {
                newIndex = Math.min(notes.length - 1, focusedItemIndex + 1);
                event.preventDefault();
              } else {
                // At the bottom, allow natural focus movement out of the list
                return;
              }
              break;
          case 'Enter':
          case ' ':
              if (newIndex >= 0 && newIndex < notes.length) {
                 setCurrentItemIndex(newIndex);
                 // Do not force focus to play/pause button, let natural focus remain
              }
              event.preventDefault();
              break;
          case 'Tab':
              // Allow normal tab navigation to move focus out of the list
              return;
          default:
              return;
      }
      if (newIndex !== focusedItemIndex) {
          setFocusedItemIndex(newIndex);
      }
  };

  const handlePlayPauseKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
          togglePlayPause();
          event.preventDefault();
      }
  };

  // Add a new handler for container keydown events
  const handleContainerKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      // Use handleLeft as an "exit" action when Escape is pressed
      if (handleLeft) {
        handleLeft();
        event.preventDefault();
      }
    }
  };

  // --- Render Logic ---

  if (isLoadingNotes) {
    return (
        <div className='relative w-full h-full bg-gray-800 flex items-center justify-center overflow-hidden p-4'>
            <p className='text-gray-400 text-lg font-medium'>Loading Podcasts...</p>
        </div>
    );
  }

  if (notes.length === 0) {
    return (
      <div className='relative w-full h-full bg-gray-800 flex items-center justify-center overflow-hidden p-4'>
        <p className='text-gray-400 text-lg font-medium'>No podcasts found for selected authors.</p>
      </div>
    );
  }

  return (
    <div
        ref={mainContainerRef}
        className='relative w-full h-full bg-blue-950 flex flex-col overflow-hidden p-2 text-white rounded-lg'
        onKeyDown={handleContainerKeyDown}
    >
      {/* Exit Button - Only show when a podcast is selected */}
      {currentItemIndex >= 0 && notes.length > 0 && (
        <div className="absolute top-2 right-2 z-10">
          <button
            onClick={() => handleLeft && handleLeft()}
            className="p-1.5 bg-transparent text-white/30 hover:text-white/90 rounded-full focus:ring-2 focus:ring-yellow-400 transition-colors"
            tabIndex={0}
            aria-label="Exit Podcaster"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
      
      {/* Scrollable Podcast List */}
      <div
          ref={scrollableListRef}
          tabIndex={0}
          onKeyDown={handleListKeyDown}
          className="flex-grow w-full overflow-y-auto mb-2 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-offset-2 focus:ring-offset-blue-950 rounded" 
          aria-activedescendant={notes[focusedItemIndex]?.id}
          aria-label="Podcast List"
          role="listbox"
      >
        {notes.map((note, index) => {
            const isActuallySelected = index === currentItemIndex;
            const isFocused = index === focusedItemIndex;
            let itemBg = 'bg-blue-800 bg-opacity-60 hover:bg-blue-700 hover:bg-opacity-80';
            if (isActuallySelected) {
                itemBg = 'bg-purple-700 bg-opacity-70';
            }
            const focusStyle = isFocused ? 'ring-2 ring-yellow-400 ring-offset-1 ring-offset-blue-950' : '';
            const profile = profiles[note.posterPubkey];
            const itemDisplayName = profile?.name || profile?.displayName || note.posterPubkey.substring(0, 10) + '...';
            const itemPictureUrl = profile?.picture;
            const itemIsLoadingProfile = profile?.isLoading;

            return (
                <div
                    key={note.id}
                    id={note.id}
                    ref={(el) => {
                        if (index < listItemRefs.current.length) {
                            listItemRefs.current[index] = el;
                        }
                    }}
                    role="option"
                    aria-selected={isActuallySelected}
                    tabIndex={-1}
                    className={`flex items-center p-2 mb-1 rounded-md cursor-pointer transition-colors ${itemBg} ${focusStyle} focus:outline-none`}
                    onClick={() => {
                        if (index === currentItemIndex) {
                            // If clicking on already selected item, exit to video mode
                            if (handleLeft) {
                                handleLeft();
                            }
                        } else {
                            // Normal behavior - select the new item
                            setCurrentItemIndex(index);
                        }
                    }}
                    title={note.content || note.url}
                >
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-700 flex items-center justify-center mr-2">
                        <span className="text-xs font-semibold text-white">{notes.length - index}</span>
                    </div>
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 overflow-hidden mr-2">
                        {itemIsLoadingProfile ? (
                            <div className="w-full h-full animate-pulse bg-gray-400"></div>
                        ) : itemPictureUrl ? (
                            <img 
                              src={itemPictureUrl} 
                              alt={itemDisplayName} 
                              className="w-full h-full object-cover" 
                            />
                        ) : (
                            <span className="text-gray-300 text-xs font-semibold flex items-center justify-center h-full uppercase">
                                {itemDisplayName.substring(0, 1)}
                            </span>
                        )}
                    </div>
                    <div className="flex-grow flex flex-col">
                        <p className="text-sm text-white truncate" title={itemDisplayName}>
                           {itemDisplayName}
                        </p>
                    </div>
                </div>
            );
        })}
      </div>

      {/* Playback Controls */}
      <div className="w-full flex flex-col items-center justify-center mb-1 bg-blue-900 bg-opacity-50 rounded p-1">
        <div className="w-full flex justify-between items-center mb-1 px-1 max-w-full">
          <button
            ref={playPauseButtonRef}
            onClick={togglePlayPause}
            onKeyDown={handlePlayPauseKeyDown}
            className="flex-shrink-0 p-1 rounded-md text-white bg-blue-700 hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-1 focus:ring-offset-blue-900 transition-colors duration-150"
            aria-label={isPlaying ? "Pause" : "Play"}
            tabIndex={0}
          >
            {isPlaying ? (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
              </svg>
            )}
          </button>
          <button
            ref={speedButtonRef}
            onClick={() => setIsSpeedMenuOpen(prev => !prev)}
            className="flex-shrink-0 p-1 ml-2 text-white bg-blue-700 hover:bg-blue-600 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-1 focus:ring-offset-blue-900 transition-colors duration-150 text-xs"
            aria-label="Change playback speed"
            tabIndex={0}
          >
            {playbackRate.toFixed(2)}x
          </button>
        </div>
        {/* Speed Menu */}
        {isSpeedMenuOpen && (
          <div 
            ref={speedMenuRef}
            className="absolute right-2 bottom-12 w-24 bg-blue-800 shadow-lg rounded-md py-1 z-10 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-1 focus:ring-offset-blue-950"
            role="menu"
            aria-label="Playback speed options"
          >
            {[2.0, 1.75, 1.5, 1.25, 1.0, 0.75].map(rate => (
              <button
                key={rate}
                onClick={() => handleSpeedChange(rate)}
                className={`w-full text-left px-3 py-1 text-white hover:bg-blue-700 text-xs ${playbackRate === rate ? 'font-bold' : ''}`}
                role="menuitem"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    handleSpeedChange(rate);
                    e.preventDefault();
                  }
                }}
              >
                {rate.toFixed(2)}x
              </button>
            ))}
          </div>
        )}
        {/* Progress Bar */}
        <div className="w-full flex items-center justify-center max-w-full px-1 mt-1">
          <span className="text-xs text-gray-300 w-10 text-right mr-2 flex-shrink-0">{formatTime(currentTime)}</span>
          <input
            ref={progressBarRef}
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-1 bg-blue-600 rounded-lg appearance-none cursor-pointer accent-yellow-400 focus:outline-none focus:ring-1 focus:ring-yellow-400 focus:ring-offset-1 focus:ring-offset-blue-900"
            aria-label="Seek through podcast"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                // Allow TV remote navigation to work naturally unless seeking is performed
                const seekAmount = duration / 20; // e.g., 5% of duration
                if (e.key === 'ArrowLeft') {
                  const newTime = Math.max(0, currentTime - seekAmount);
                  if (currentTime > 0) {
                    if (progressBarRef.current) {
                      progressBarRef.current.value = newTime.toString();
                      handleSeek({ target: progressBarRef.current } as React.ChangeEvent<HTMLInputElement>);
                    }
                    e.preventDefault();
                  } else if (handleLeft) {
                    handleLeft();
                    e.preventDefault();
                  }
                } else if (e.key === 'ArrowRight') {
                  const newTime = Math.min(duration, currentTime + seekAmount);
                  if (currentTime < duration) {
                    if (progressBarRef.current) {
                      progressBarRef.current.value = newTime.toString();
                      handleSeek({ target: progressBarRef.current } as React.ChangeEvent<HTMLInputElement>);
                    }
                    e.preventDefault();
                  } else if (handleRight) {
                    handleRight();
                    e.preventDefault();
                  }
                }
              }
            }}
          />
          <span className="text-xs text-gray-300 w-10 text-left ml-2 flex-shrink-0">{formatTime(duration)}</span>
        </div>
      </div>

    </div>
  );
};

export default Podcastr; 
