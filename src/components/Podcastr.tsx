// src/components/Podcastr.tsx

import React, { useState, useEffect, useRef } from 'react';
import { useInactivityTimer } from '../hooks/useInactivityTimer';
// import { usePodcastNotes } from '../hooks/usePodcastNotes'; // <<< REMOVE
import { useNDK, useProfile } from '@nostr-dev-kit/ndk-hooks'; // <<< CHANGE IMPORT PATH
import { useMediaElementPlayback } from '../hooks/useMediaElementPlayback';
import { NostrNote } from '../types/nostr'; // <<< ADD type import

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

// +++ NEW INTERNAL COMPONENT: PodcastItem +++
interface PodcastItemProps {
  note: NostrNote;
  isSelected: boolean;
  onClick: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  itemRef: (el: HTMLDivElement | null) => void; // Function to set the ref
}

const PodcastItem: React.FC<PodcastItemProps> = ({ note, isSelected, onClick, onKeyDown, itemRef }) => {
  const { ndk } = useNDK(); // Access NDK if needed, though useProfile handles it
  const profile = useProfile(note.posterPubkey); // <<< Pass pubkey directly, access profile directly

  let itemBg = 'bg-blue-800 bg-opacity-60 hover:bg-blue-700 hover:bg-opacity-80';
  if (isSelected) {
    itemBg = 'bg-purple-700 bg-opacity-70';
  }

  const itemDisplayName = profile?.name || profile?.displayName || (note.posterPubkey ? note.posterPubkey.substring(0, 10) + '...' : 'Unknown');
  const itemPictureUrl = profile?.picture;

  // Logging removed for brevity in this refactor step

  return (
    <div
      key={note.id} // Key remains important here for React
      id={note.id}
      ref={itemRef} // Use the passed ref setter
      role="option"
      aria-selected={isSelected}
      tabIndex={0}
      className={`flex items-center p-2 mb-1 rounded-md cursor-pointer transition-colors ${itemBg} focus:border focus:border-orange-500`}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      {itemPictureUrl ? (
        <img src={itemPictureUrl} alt={itemDisplayName} className="w-8 h-8 rounded-full mr-3 flex-shrink-0 bg-gray-600" />
      ) : (
        <div className="w-8 h-8 rounded-full mr-3 flex-shrink-0 bg-gray-600 flex items-center justify-center text-gray-400 text-xs">
          {itemDisplayName.substring(0, 2)}
        </div>
      )}
      <div className="flex-grow overflow-hidden whitespace-nowrap text-ellipsis">
        <p className="text-sm font-medium text-white truncate">{note.title || 'Untitled Podcast'}</p>
        <p className="text-xs text-gray-400 truncate">{itemDisplayName}</p>
      </div>
    </div>
  );
};
// +++ END NEW INTERNAL COMPONENT +++

interface PodcastPlayerProps {
  authors: string[];
  notes: NostrNote[]; // <<< ADD notes prop
  isLoadingNotes: boolean; // <<< ADD isLoadingNotes prop
  handleLeft?: () => void;
  handleRight?: () => void;
  onFocusRightEdge?: () => void;
  // onFocusBottomEdge?: () => void; // <<< REMOVED
}

const Podcastr: React.FC<PodcastPlayerProps> = ({ authors, notes, isLoadingNotes, handleLeft, handleRight, onFocusRightEdge /*, onFocusBottomEdge*/ }) => {
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
  // <<< REMOVE internal notes fetching >>>
  // const { notes, isLoading: isLoadingNotes } = usePodcastNotes(authors);
  // Get the current item based on the index *after* notes have loaded
  const currentItem = !isLoadingNotes && notes.length > currentItemIndex ? notes[currentItemIndex] : null;
  // --- Log currentItem and its URL before passing to hook ---
  console.log(`Podcastr: Checking currentItem for media hook: index=${currentItemIndex}, isLoadingNotes=${isLoadingNotes}, notes.length=${notes.length}, currentItem exists=${!!currentItem}, url=${currentItem?.url}`);
  const {
    isPlaying,
    currentTime,
    duration,
    playbackRate,
    setPlaybackRate,
    togglePlayPause,
    handleSeek
  } = useMediaElementPlayback({
      mediaElementRef: audioRef as React.RefObject<HTMLAudioElement | HTMLVideoElement>,
      currentItemUrl: currentItem?.url || null,
      viewMode: 'imagePodcast'
  });
  const [isInactive, resetInactivityTimer] = useInactivityTimer(45000);

  // --- Effects ---

  // <<< NEW EFFECT: Focus first list item on notes load >>>
  useEffect(() => {
    // Only run if notes are loaded and the list is not empty
    if (!isLoadingNotes && notes.length > 0) {
      // Ensure the ref for the first item exists
      if (listItemRefs.current[0]) {
        console.log("Podcastr: Focusing first list item.");
        listItemRefs.current[0].focus();
      } else {
        console.warn("Podcastr: Attempted to focus first item, but ref was null.");
      }
    }
  // Depend on notes list and loading state
  }, [notes, isLoadingNotes]);

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
            // const profile = note.posterPubkey ? profiles[note.posterPubkey] : null; // <<< REMOVE PROFILE LOOKUP HERE
            // const itemDisplayName = profile?.name || profile?.displayName || (note.posterPubkey ? note.posterPubkey.substring(0, 10) + '...' : 'Unknown'); // <<< REMOVE
            // const itemPictureUrl = profile?.picture; // <<< REMOVE
            // const itemIsLoadingProfile = profile?.isLoading; // <<< REMOVE

            const handleItemKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
              // Logging removed for brevity
              if (event.key === 'Enter' || event.key === ' ') {
                setCurrentItemIndex(index);
                event.preventDefault();
              }
            };

            // Create onClick specific to this item
            const handleItemClick = () => {
                if (index === currentItemIndex) {
                  if (handleLeft) handleLeft(); // Exit if clicking selected
                } else {
                  setCurrentItemIndex(index);
                }
            };

            // Create ref setter specific to this item
            const setItemRef = (el: HTMLDivElement | null) => {
                if (index < listItemRefs.current.length) {
                    listItemRefs.current[index] = el;
                }
            };

            // Pass props down to the new PodcastItem component
            return (
              <PodcastItem
                key={note.id} // React key for the list item itself
                note={note}
                isSelected={isActuallySelected}
                onClick={handleItemClick}
                onKeyDown={handleItemKeyDown}
                itemRef={setItemRef}
              />
            );

            /* <<< REMOVE OLD ITEM RENDERING LOGIC >>>
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
                            // --- Log Before State Update ---
                            console.log(`PodcastItem Click: About to call setCurrentItemIndex(${index})`);
                            // ---
                            setCurrentItemIndex(index);
                        }
                    }}
                    onKeyDown={handleItemKeyDown}
                    onFocus={handleItemFocus}
                    onBlur={handleItemBlur}
                >
                    {itemPictureUrl ? (
                      <img src={itemPictureUrl} alt={itemDisplayName} className="w-8 h-8 rounded-full mr-3 flex-shrink-0 bg-gray-600" />
                    ) : (
                      <div className="w-8 h-8 rounded-full mr-3 flex-shrink-0 bg-gray-600 flex items-center justify-center text-gray-400 text-xs">
                          {itemDisplayName.substring(0, 2)}
                      </div>
                    )}
                    <div className="flex-grow overflow-hidden whitespace-nowrap text-ellipsis">
                      <p className="text-sm font-medium text-white truncate">{note.title || 'Untitled Podcast'}</p>
                      <p className="text-xs text-gray-400 truncate">{itemDisplayName}</p>
                    </div>
                </div>
            );
            */
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
                  // --- DIAGNOSTIC LOGGING (Level 2 - Props check) ---\
                  console.log(`Podcastr Seekbar KeyDown: key='${e.key}', handleLeft defined=${!!handleLeft}`);
                  // --- END DIAGNOSTIC LOGGING ---\

                  // Handle Up to escape the seek bar -> focus list item
                  if (e.key === 'ArrowUp') {
                    // <<< CHANGE START >>>
                    // Focus the currently selected item, or the first item if index is invalid
                    const targetIndex = currentItemIndex >= 0 && currentItemIndex < listItemRefs.current.length ? currentItemIndex : 0;
                    const targetItem = listItemRefs.current[targetIndex];
                    if (targetItem) {
                        console.log(`Podcastr: Seek bar up -> focusing list item index ${targetIndex}`);
                        targetItem.focus();
                        e.preventDefault(); // Prevent default scroll/etc.
                    } else {
                         console.warn(`Podcastr: Seek bar up -> list item ref at index ${targetIndex} not found!`);
                         // Optionally, call handleLeft as a fallback? For now, do nothing.
                         // if (handleLeft) { handleLeft(); e.preventDefault(); }
                    }
                    // <<< CHANGE END >>>
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
