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
  onFocusRightEdge?: () => void;
  // onFocusBottomEdge?: () => void; // <<< REMOVED
}

const Podcastr: React.FC<PodcastPlayerProps> = ({ authors, handleLeft, handleRight, onFocusRightEdge /*, onFocusBottomEdge*/ }) => {
  const [currentItemIndex, setCurrentItemIndex] = useState(0);
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
  // --- Log currentItem and its URL before passing to hook ---
  console.log(`Podcastr: Checking currentItem for audio hook: index=${currentItemIndex}, isLoadingNotes=${isLoadingNotes}, notes.length=${notes.length}, currentItem exists=${!!currentItem}, url=${currentItem?.url}`);
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

  // Reset selection when notes list changes (e.g., author selection changes)
  useEffect(() => {
    // Check if notes array identity has changed or length is 0 to avoid unnecessary resets
    setCurrentItemIndex(0);
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

  const handlePlayPauseKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
          togglePlayPause();
          event.preventDefault();
      }
  };

  // Modify handler to only block Escape
  const handleContainerKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    // If the key is NOT Escape, do nothing and let it bubble.
    if (event.key !== 'Escape') {
      return;
    }

    // If it IS Escape, handle the exit action.
    if (handleLeft) {
      console.log("Podcastr Container: Escape pressed, calling handleLeft.");
      handleLeft();
      event.preventDefault(); // Prevent default ONLY for Escape
    }
  };

  // --- Render Logic ---

  // <<< ADD LOGGING HERE >>>
  // Log seek bar related values on each render for diagnostics
  console.log(`Podcastr Render Check: duration=${duration}, isDisabled=${!duration || duration <= 0}, handleLeft defined=${!!handleLeft}`);

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
        onKeyDown={handleContainerKeyDown} // <<< RESTORED with modified handler
    >
      {/* Scrollable Podcast List - Container is NOT focusable */}
      <div
          ref={scrollableListRef}
          className="flex-grow w-full overflow-y-auto mb-2 rounded"
          aria-label="Podcast List"
          role="listbox"
      >
        {notes.map((note, index) => {
            const isActuallySelected = index === currentItemIndex;
            let itemBg = 'bg-blue-800 bg-opacity-60 hover:bg-blue-700 hover:bg-opacity-80';
            if (isActuallySelected) {
                itemBg = 'bg-purple-700 bg-opacity-70';
            }
            const profile = profiles[note.posterPubkey];
            const itemDisplayName = profile?.name || profile?.displayName || note.posterPubkey.substring(0, 10) + '...';
            const itemPictureUrl = profile?.picture;
            const itemIsLoadingProfile = profile?.isLoading;

            const handleItemKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
              // --- Log Entry --- 
              console.log(`PodcastItem ${index} KeyDown Handler Fired. Key: ${event.key}`);
              // ---
              console.log(`PodcastItem ${index} KeyDown: ${event.key}`); // Keep existing
              if (event.key === 'Enter' || event.key === ' ') {
                console.log(`PodcastItem ${index} Selected`);
                // --- Log Before State Update ---
                console.log(`PodcastItem KeyDown: About to call setCurrentItemIndex(${index})`);
                // ---
                setCurrentItemIndex(index);
              }
            };

            const handleItemFocus = () => {
                console.log(`PodcastItem ${index} Focused`);
            };

            const handleItemBlur = () => {
                console.log(`PodcastItem ${index} Blurred`);
            };

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
                    tabIndex={0}
                    className={`flex items-center p-2 mb-1 rounded-md cursor-pointer transition-colors ${itemBg} focus:border focus:border-orange-500`}
                    onClick={() => {
                        // --- Log Entry ---
                        console.log(`PodcastItem ${index} Click Handler Fired. Current index: ${currentItemIndex}`);
                        // ---
                        if (index === currentItemIndex) {
                            // If clicking on already selected item, exit to video mode
                            if (handleLeft) {
                                handleLeft();
                            }
                        } else {
                            // Normal behavior - select the new item
                            // --- Log Before State Update ---
                            console.log(`PodcastItem Click: About to call setCurrentItemIndex(${index})`);
                            // ---
                            setCurrentItemIndex(index);
                        }
                    }}
                    onKeyDown={handleItemKeyDown}
                    onFocus={handleItemFocus}
                    onBlur={handleItemBlur}
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

      {/* Playback Controls - Inline & Styled */}
      <div className="w-full flex flex-row items-center justify-between mb-1 bg-black rounded p-1">
          
          {/* Play/Pause Button (Left) */}
          <button
            ref={playPauseButtonRef}
            onClick={togglePlayPause}
            onKeyDown={handlePlayPauseKeyDown}
            // Blue Background, Brighter Purple-500 Icon:
            className="flex-shrink-0 p-1 rounded-md text-purple-500 bg-blue-700 hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-1 focus:ring-offset-blue-900 transition-colors duration-150"
            aria-label={isPlaying ? "Pause" : "Play"}
            tabIndex={0}
          >
            {isPlaying ? (
              // Pause Icon (Outline)
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
              </svg>
            ) : (
              // Play Icon (Filled)
              <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
              </svg>
            )}
          </button>

          {/* Seek Bar Area (Middle - Flex Grow) */}
          <div className="flex-grow flex items-center justify-center mx-2">
              <span className="text-xs text-gray-300 w-10 text-right mr-2 flex-shrink-0">{formatTime(currentTime)}</span>
              {/* --- DIAGNOSTIC LOGGING --- */}
              {/* MOVED console.log(...) FROM HERE TO BEFORE RETURN */}
              {/* --- END DIAGNOSTIC LOGGING --- */}
              <input
                ref={progressBarRef}
                type="range"
                min={0}
                max={duration || 100}
                value={currentTime}
                onChange={handleSeek}
                // Restore focus styling, tabIndex, and onKeyDown:
                className="w-full h-1 bg-purple-600 rounded-lg appearance-none cursor-pointer accent-purple-500 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-1 focus:ring-offset-black"
                aria-label="Seek through podcast"
                tabIndex={0} // RESTORED
                disabled={!duration || duration <= 0} 
                onKeyDown={(e) => { 
                  console.log(`Podcastr Seekbar KeyDown - Fired! key='${e.key}'`);
                  // --- DIAGNOSTIC LOGGING (Level 2 - Props check) ---
                  console.log(`Podcastr Seekbar KeyDown: key='${e.key}', handleLeft defined=${!!handleLeft}`); 
                  // --- END DIAGNOSTIC LOGGING ---

                  // Handle Up to escape the seek bar
                  if (e.key === 'ArrowUp') {
                    if (handleLeft) {
                      console.log("Podcastr: Seek bar up -> calling handleLeft (exit)");
                      handleLeft();
                      e.preventDefault();
                    }
                  }
                  // Handle Down to focus Speed Button
                  if (e.key === 'ArrowDown') {
                      if (speedButtonRef.current) {
                          console.log("Podcastr: Seek bar down -> focusing speed button");
                          speedButtonRef.current.focus();
                          e.preventDefault();
                      } else {
                           console.warn("Podcastr: Seek bar down -> speedButtonRef not found!")
                      }
                  }
                  // Left/Right arrow keys will perform default seek bar actions (no preventDefault here)
                }}
              />
              <span className="text-xs text-gray-300 w-10 text-left ml-2 flex-shrink-0">{formatTime(duration)}</span>
          </div>

          {/* Speed Button (Right) */}
          <div className="relative flex-shrink-0">
              <button
                ref={speedButtonRef}
                onClick={() => setIsSpeedMenuOpen(prev => !prev)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    setIsSpeedMenuOpen(prev => !prev);
                    e.preventDefault();
                  }
                  if (e.key === 'ArrowRight') {
                    if (onFocusRightEdge) {
                      console.log("Podcastr: Speed button right -> focus right edge");
                      onFocusRightEdge();
                      e.preventDefault();
                    } else if (handleRight) {
                      handleRight();
                      e.preventDefault();
                    }
                  }
                }}
                // Purple Background, Purple Text (Speed Value):
                className="p-1 text-purple-400 bg-purple-700 hover:bg-purple-600 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-1 focus:ring-offset-black transition-colors duration-150 text-xs"
                aria-label="Change playback speed"
                tabIndex={0}
              >
                {playbackRate.toFixed(2)}x
              </button>
              {/* Speed Menu - Adjust positioning relative to button */}
              {isSpeedMenuOpen && (
                <div 
                  ref={speedMenuRef}
                  // Adjusted position: absolute, bottom-full (above button), right-0 
                  className="absolute bottom-full right-0 mb-1 w-24 bg-blue-800 shadow-lg rounded-md py-1 z-10 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-1 focus:ring-offset-black"
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
          </div>

      </div>

      {/* Hidden Audio Element - Ref attached */}
      <audio ref={audioRef} />

    </div> // End main component div
  );
};

export default Podcastr; 
